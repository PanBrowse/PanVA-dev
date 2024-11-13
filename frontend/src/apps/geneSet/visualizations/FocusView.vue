<template>
  <ACard
    title="Focus View"
    :style="{
      width: `${100}%`,
      height: `${100}%`,
    }"
    :bordered="false"
    size="small"
  >
    <template #extra
      ><AButton type="text" size="small"
        ><CloseCircleOutlined key="edit" /></AButton
    ></template>
    <svg
      :id="`container_${name}`"
      :width="containerWidth"
      :height="svgHeight"
    ></svg>
  </ACard>
</template>

<script lang="ts">
import { CloseCircleOutlined, ConsoleSqlOutlined } from '@ant-design/icons-vue'
import { Button, Card } from 'ant-design-vue'
import * as d3 from 'd3'
import { type Dictionary } from 'lodash'
import { mapActions, mapState } from 'pinia'
import { computed, defineComponent, ref, watch } from 'vue'

import colors from '@/assets/colors.module.scss'
import {
  calculateCompressionFactor,
  calculateIndividualScales,
  calculateWidth,
  updateViewportRangeBounds,
} from '@/helpers/axisStretch'
import { getSequenceIdByUid, groupInfoDensity } from '@/helpers/chromosome'
import { crossDetection } from '@/helpers/crossDetection'
import { getGeneSymbolSize, getGeneSymbolType } from '@/helpers/customSymbols'
import { runSpringSimulation } from '@/helpers/springSimulation'
import type { GraphNode, GraphNodeGroup } from '@/helpers/springSimulationUtils'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGenomeStore } from '@/stores/geneSet'
import type { Gene, GroupInfo, SequenceInfo, SequenceMetrics } from '@/types'

// states
const compressionViewWindowRange = ref<[number, number]>([0, 1])
const geneToCompressionScales = ref<
  Dictionary<d3.ScaleLinear<number, number, never>>
>({})
const globalCompressionFactor = ref<number>(1)
const currentHeat = ref<number>(1000)
const crossingHomologyGroups = ref<number[]>([])
const showGeneBars = ref<boolean>(true)
const brush = ref<d3.BrushBehavior<unknown>>(d3.brushX())
const anchorMax = ref<number>(0)
const anchorMin = ref<number>(0)
const anchorLookup = ref<Dictionary<number>>({})

export default {
  name: 'FocusView',
  props: {
    chromosomeNr: { type: String, required: true },
    name: String,
    data: Array<SequenceMetrics>,
    dataGenes: { type: Array<GroupInfo> },
    dataMin: { type: Number, required: true },
    dataMax: { type: Number, required: true },
    nrColumns: Number,
    maxGC: { type: Number, required: true },
    minGC: { type: Number, required: true },
  },
  components: {
    ACard: Card,
    AButton: Button,
    CloseCircleOutlined: CloseCircleOutlined,
  },
  setup() {
    const genomeStore = useGenomeStore()
    const filteredSequences = ref<SequenceInfo[]>([])
    const filteredGenes = ref<Gene[]>([])
    const indexMap = ref<Map<number, number>>(new Map())
    const mappedIndices = ref<number[]>([])
    const sequenceIndicesInLookup = ref<number[]>([])
    // const selectedGeneUids = ref<string[]>([])
    const selectedGeneUids = computed(() => genomeStore.selectedGeneUids)
    const geneToLocusSequenceLookup = genomeStore.geneToLocusSequenceLookup

    // watch(
    //   () => genomeStore.selectedGeneUids,
    //   (newSelectedGeneUids) => {
    //     selectedGeneUids.value = newSelectedGeneUids
    //   }
    // )

    // Watch for changes in selectedGeneUids and update filteredGenes accordingly
    watch(
      selectedGeneUids,
      (newSelectedGeneUids) => {
        filteredGenes.value = genomeStore.genomeData.genes.filter((gene) =>
          newSelectedGeneUids.includes(gene.uid)
        )
        console.log('Filtered gene uids:', genomeStore.selectedGeneUids)

        console.log('Filtered genes:', filteredGenes.value)
      },
      { immediate: true } // Ensures filteredGenes is populated on component load
    )

    // const selectedGeneUids = computed(() => genomeStore.selectedGeneUids)

    // Watch for changes in selectedSequencesLasso
    watch(
      () => genomeStore.selectedSequencesLasso,
      (newSelection) => {
        if (newSelection && newSelection.length) {
          // Filter the sequences based on UIDs in selectedSequencesLasso
          filteredSequences.value = genomeStore.genomeData.sequences.filter(
            (sequence) => newSelection.includes(sequence.uid)
          )
          console.log('Filtered sequences:', filteredSequences.value)
        } else {
          // Reset or handle the case where no sequence is selected
          filteredSequences.value = []
        }
      },
      { immediate: true }
    )

    watch(
      filteredSequences,
      (newVal) => {
        console.log('Filtered sequences updated:', newVal)

        // Call addLabels whenever `filteredSequences` changes
        sequenceIndicesInLookup.value = filteredSequences.value.map(
          (sequence) => {
            return genomeStore.sequenceUidLookup[sequence.uid]
          }
        )

        console.log(
          'Indices of filtered sequences in sequenceUidLookup:',
          sequenceIndicesInLookup
        )

        indexMap.value = new Map(
          sequenceIndicesInLookup.value.map((value, idx) => [value, idx])
        )
        mappedIndices.value = sequenceIndicesInLookup.value.map(
          (index) => indexMap.value.get(index) ?? 0
        )
        console.log('mappedIndices: ', mappedIndices.value, indexMap)
      },
      { immediate: true }
    )

    return {
      filteredSequences,
      sequenceIndicesInLookup,
      filteredGenes,
      mappedIndices,
      genomeStore,
      indexMap,
      selectedGeneUids,
      geneToLocusSequenceLookup,
    }
  },
  data: () => ({
    svgWidth: 0,
    svgHeight: 0,
    svgWidthScaleFactor: 1,
    svgHeightScaleFactor: 0.95,
    // resizeObserver: null as ResizeObserver | null,
    margin: {
      top: 10,
      bottom: 10,
      right: 10,
      left: 10,
      yAxis: 40,
    },
    padding: {
      cardBody: 12,
    },
    cardHeaderHeight: 40,
    transitionTime: 500,
    numberOfCols: 2,
    barHeight: 6,
    sortedSequenceIds: [],
    idleTimeout: { type: [null, Number] },
  }),
  computed: {
    ...mapState(useGeneSetStore, [
      'sortedChromosomeSequenceIndices',
      'sortedGroupInfoLookup',
      'groupInfoLookup',
      'sequenceIdLookup',
      'sortedMrnaIndices',
      'chromosomes',
      'numberOfChromosomes',
      'percentageGC',
      'colorGenomes',
      'homologyGroups',
      'upstreamHomologies',
      'showTable',
      'showNotificationsDetail',
      'homologyFocus',
      'anchor',
      // 'colorGenes',
      'showLinks',
    ]),
    containerWidth() {
      return this.showTable ? this.svgWidth / 2 : this.svgWidth
    },
    visWidth() {
      return this.containerWidth - 12 - 12 - 10 - 17.5
    },
    visHeight() {
      return this.svgHeight
    },
    windowRange(): [number, number] {
      return [this.margin.yAxis + this.margin.left, this.visWidth - this.margin.yAxis - this.margin.left]
    },
    xScale() {
      return this.anchor
        ? d3
            .scaleLinear()
            .domain([-anchorMax.value, anchorMax.value])
            .nice()
            .rangeRound([
              0,
              this.visWidth - this.margin.yAxis - this.margin.left,
            ])
        : d3
            .scaleLinear()
            .domain([this.dataMin > 0 ? 0 : this.dataMin, this.dataMax])
            .nice()
            .rangeRound([
              0,
              this.visWidth - this.margin.yAxis - this.margin.left,
            ])
    },
    colorScale(): d3.ScaleOrdinal<string, unknown, never> {
      return d3
        .scaleOrdinal()
        .domain(this.homologyGroups.map(toString))
        .range(d3.schemeCategory10)
    },
    colorScaleGC() {
      return d3
        .scaleSequential()
        .domain([this.minGC ?? 0, this.maxGC ?? 1])
        .interpolator(d3.interpolateGreys)
    },
    colorScaleGenome(): d3.ScaleOrdinal<string, unknown, never> {
      return d3
        .scaleOrdinal()
        .domain(['1', '2', '3', '4', '5'])
        .range(d3.schemeCategory10)
    },
    colorGenes() {
      let nGenesTotal = 0
      let nOfGenomes = 0
      for (const [key, value] of Object.entries(this.geneToWindowScales)) {
        nGenesTotal = nGenesTotal + value.domain().length - 2
        nOfGenomes = nOfGenomes + 1
      }
      if (nGenesTotal / nOfGenomes < 15) {
        return true
      }
      return false
    },
    shapeGenerator() {
      const shapes = [
        d3.symbolPlus,
        d3.symbolWye,
        d3.symbolTriangle,
        d3.symbolSquare,
        d3.symbolStar,
        d3.symbolDiamond,
        d3.symbolsStroke[0],
        d3.symbolsStroke[1],
        d3.symbolsStroke[2],
        d3.symbolsStroke[3],
        d3.symbolsStroke[4],
      ]
      const obj = Object.fromEntries(
        this.homologyGroups.map((hg, dataIndex) => [hg, shapes[dataIndex]])
      )
      return obj
    },
    geneToWindowScales() {
      let newScales: Dictionary<d3.ScaleLinear<number, number, never>> = {}
      console.log('geneToCompressionScales', geneToCompressionScales.value)
      Object.entries(geneToCompressionScales.value).forEach((scaleEntry) => {
        console.log(scaleEntry[1].domain(), scaleEntry[1].range())
        newScales[scaleEntry[0]] = updateViewportRangeBounds(
          scaleEntry[1],
          compressionViewWindowRange.value,
          scaleEntry[1],
          this.windowRange
        )
      })
      return newScales
    },
  },
  methods: {
    ...mapActions(useGeneSetStore, ['deleteChromosome']),
    observeWidth() {
      const htmlElement: HTMLElement | null = document.getElementById('content')
      if (htmlElement === null) {
        return
      }
      let vis = this
      const resizeObserver = new ResizeObserver(function () {
        vis.svgWidth = htmlElement.offsetWidth * vis.svgWidthScaleFactor
      })
      resizeObserver.observe(htmlElement)
    },
    svg() {
      return d3.select(`#container_${this.name}`)
    },
    g() {
      return d3
        .select(`#container_${this.name}`)
        .append('g')
        .attr('class', 'genes')
    },
    addClipPath() {
      this.svg().select('defs').remove() //needed because otherwise draws twice in some cases. To-do: fix side effect

      this.svg()
        .append('defs')
        .append('svg:clipPath')
        .attr('id', 'clipDetails')
        .append('svg:rect')
        .attr('width', this.visWidth)
        .attr(
          'height',
          this.svgHeight +
            this.cardHeaderHeight +
            this.padding.cardBody +
            this.margin.top
        )
        .attr('x', 0)
        .attr('y', 0)
    },

    ///////////////////////////////////////////////////////////////////////////////Update chart////////////////////////////////////
    updateChartBrushing({ selection }: { selection: [number, number] }): NodeJS.Timeout | undefined {
      console.log('brush selection', selection)

      // If no selection, back to initial coordinate. Otherwise, update X axis domain
      if (!selection) {
        return
      }

      this.xScale.domain([
        this.xScale.invert(selection[0] - this.margin.yAxis - this.margin.left),
        this.xScale.invert(selection[1] - this.margin.yAxis - this.margin.left),
      ])
      const globalRangeWidth =
        compressionViewWindowRange.value[1] -
        compressionViewWindowRange.value[0]
      const currentGlobalRangeBounds: [number, number] =
        compressionViewWindowRange.value
      const rangeWidth = this.windowRange[1] - this.windowRange[0]
      const selectionPercentages = [
        (selection[0] - this.margin.yAxis - this.margin.left) / rangeWidth,
        (selection[1] - this.margin.yAxis - this.margin.left ) / rangeWidth,
      ]
      const newRangeBoundsGlobal: [number, number] = [
        currentGlobalRangeBounds[0] +
          selectionPercentages[0] * globalRangeWidth,
        currentGlobalRangeBounds[0] +
          selectionPercentages[1] * globalRangeWidth,
      ]
      compressionViewWindowRange.value = newRangeBoundsGlobal

      this.svg().select('.brush').call(brush.value?.move, null) // This remove the grey brush area as soon as the selection has been done
      this.svg()
        .select('.x-axis')
        .transition()
        .duration(1000)
        .call(d3.axisTop(this.xScale))
        .call((g) => g.select('.domain').remove())
        .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
        .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))

      this.svg().selectAll('circle.density').remove()
      this.svg().selectAll('text.density-value-focus').remove()
      this.draw()
    },
    /////////////////////////////////////////////////////////////////////////////// Reset zoom ////////////////////////////////////
    resetZoom() {
      let vis = this
      this.svg().on('dblclick', function () {
        if (!vis.anchor) {
          vis.xScale
            .domain([vis.dataMin > 0 ? 0 : vis.dataMin, vis.dataMax])
            .nice()

          vis
            .svg()
            .select('.x-axis')
            .transition()
            .duration(1000)
            .call(d3.axisTop(vis.xScale).tickValues(vis.ticksXdomain))
            .call((g) => g.select('.domain').remove())
            .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
            .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))

          vis.svg().selectAll('circle.density').remove()
          vis.svg().selectAll('text.density-value-focus').remove()
          vis.draw()
        } else {
          vis.xScale.domain([-anchorMax.value, anchorMax.value]).nice()

          vis
            .svg()
            .select('.x-axis')
            .transition()
            .duration(1000)
            // .call(d3.axisTop(vis.xScale).tickValues(vis.ticksXdomain))
            .call((g) => g.select('.domain').remove())
            .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
            .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))

          vis.svg().selectAll('circle.density').remove()
          vis.svg().selectAll('text.density-value-focus').remove()
          vis.draw()
        }
      })
    },

    ///////////////////////////////////////////////////////////////////////////////Pan ////////////////////////////////////
    pan() {
      let vis = this
      // Add event listener on keydown
      document.addEventListener('keydown', (event) => {
        let name = event.key
        let code = event.code
        // Alert the key name and key code on keydown
        console.log('key', name, code)
        const prevDomainGlobal = compressionViewWindowRange.value
        console.log('previous domain', prevDomainGlobal)
        const rangeDomain = prevDomainGlobal[1] - prevDomainGlobal[0]
        console.log('range domain', rangeDomain)

        // update global domain
        let newDomain: [number, number]
        if (event.key === 'ArrowLeft') {
          newDomain = [
            prevDomainGlobal[0] - rangeDomain / 4,
            prevDomainGlobal[1] - rangeDomain / 4,
          ]
        } else if (event.key === 'ArrowRight') {
          newDomain = [
            prevDomainGlobal[0] + rangeDomain / 4,
            prevDomainGlobal[1] + rangeDomain / 4,
          ]
        } else {
          return
        }
        compressionViewWindowRange.value = newDomain

        vis.xScale
          .domain([vis.dataMin < 0 ? 0 : newDomain[0], newDomain[1]])
          .nice()

        vis
          .svg()
          .select('.x-axis')
          .call(d3.axisTop(vis.xScale))
          .call((g) => g.select('.domain').remove())
          .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
          .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))

        vis.svg().selectAll('circle.density').remove()
        vis.svg().selectAll('text.density-value-focus').remove()
        vis.draw()
      })
    },
    idled() {
      this.idleTimeout = { type: [null, Number] }
    },

    ///////////////////////////////////////////////////////////////////////////////update zoom ////////////////////////////////////

    updateZoom(zoomEvent: d3.D3ZoomEvent<Element, unknown>) {
      if (!zoomEvent) {
        return
      }
      if (zoomEvent.sourceEvent && zoomEvent.sourceEvent.type !== 'wheel') {
        return
      }

      // calculate new bounds for the range
      const zoomCenterX = zoomEvent.sourceEvent.offsetX
      const percentageZoomLeft =
        (zoomCenterX -
          this.windowRange[0] -
          this.margin.yAxis - this.margin.left) /
        (this.windowRange[1] - this.windowRange[0])
      const currentRangeBounds: [number, number] = [
        this.xScale.range()[0],
        this.xScale.range()[this.xScale.range().length - 1],
      ]
      const rangeWidth = Math.abs(
        this.xScale.range()[this.xScale.range().length - 1] -
          this.xScale.range()[0]
      )
      const newRangeBounds = [
        currentRangeBounds[0] -
          zoomEvent.sourceEvent.wheelDelta *
            rangeWidth *
            0.001 *
            percentageZoomLeft,
        currentRangeBounds[1] +
          zoomEvent.sourceEvent.wheelDelta *
            rangeWidth *
            0.001 *
            (1 - percentageZoomLeft),
      ]
      const globalRangeWidth =
        compressionViewWindowRange.value[1] -
        compressionViewWindowRange.value[0]
      const newGlobalRangeBounds: [number, number] = [
        compressionViewWindowRange.value[0] -
          zoomEvent.sourceEvent.wheelDelta *
            globalRangeWidth *
            0.001 *
            percentageZoomLeft,
        compressionViewWindowRange.value[1] +
          zoomEvent.sourceEvent.wheelDelta *
            globalRangeWidth *
            0.001 *
            (1 - percentageZoomLeft),
      ]
      compressionViewWindowRange.value = newGlobalRangeBounds
      this.xScale.domain(newRangeBounds)

      this.svg()
        .select('.x-axis')
        .transition()
        .duration(300)
        // .call(d3.axisTop(this.xScale))
        .call((g) => g.select('.domain').remove())
        .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
        .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))

      this.svg().selectAll('circle.density').remove()
      this.svg().selectAll('text.density-value-focus').remove()
      this.draw()
    },
    ///////////////////////////////////////////////////////////////////////////////Draw bars ////////////////////////////////////
    drawBars() {
      let vis = this
      this.svg()
        .selectAll('rect.bar-chr')
        .data(this.genomeStore.genomeData.sequences ?? [], (d: any) => d.sequence_id)
        .join(
          (enter) =>
            enter
              .append('rect')
              .attr(
                'transform',
                `translate(${this.margin.yAxis + this.margin.left},${this.margin.top * 2})`
              )
              .attr('class', 'bar-chr')
              .attr('x', this.xScale(0))
              .attr(
                'y',
                (d, i) =>
                  this.genomeStore.sequenceUidLookup[d.uid]  *
                  (this.barHeight + 10)
              )
              .attr(
                'width',
                (d) => vis.xScale(d.sequence_length_nuc) - vis.xScale(0)
              )
              .attr('height', this.barHeight)

              .attr('fill', (d) => {
                let color: any
                if (vis.colorGenomes == true) {
                  color = vis.colorScaleGenome(String(d.uid))
                } else {
                  color = '#f0f2f5'
                }
                return color
              })
              .attr('opacity', function (d) {
                let color
                if (vis.colorGenomes == true) {
                  color = 0.5
                } else {
                  color = 1
                }
                return color
              })
              .attr('clip-path', 'url(#clipDetails)'),
          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('x', this.xScale(0))
              .attr('fill', (d) => {
                let color: any
                if (vis.colorGenomes == true) {
                  color = vis.colorScaleGenome(String(d.uid))
                } else {
                  color = '#f0f2f5'
                  // color = '#fff'
                }
                return color
              })
              .attr('opacity', function (d) {
                let color
                if (vis.colorGenomes == true) {
                  color = 0.5
                } else {
                  color = 1
                }
                return color
              })
              .attr(
                'y',
                (d, i) =>
                  this.genomeStore.sequenceUidLookup[d.uid]  *
                  (this.barHeight + 10)
              )
              .attr(
                'width',
                (d) => vis.xScale(d.sequence_length_nuc) - vis.xScale(0)
              ),

          (exit) => exit.remove()
        )
    },
    ///////////////////////////////////////////////////////////////////////////////Draw context bars ////////////////////////////////////
    drawContextBars() {
      let vis = this
      if (this.genomeStore.genomeData.sequences === undefined) {
        return
      }
      this.svg()
        .selectAll('rect.bar-chr-context')
        .data(this.genomeStore.genomeData.sequences)
        .join(
          (enter) =>
            enter
              .append('rect')
              .attr(
                'transform',
                `translate(${this.margin.yAxis + this.margin.left},${this.margin.top * 2})`
              )
              .attr('class', 'bar-chr-context')
              .attr('x', this.anchor ? this.xScale(-35000000) : this.xScale(0))
              .attr(
                'y',
                (d, i) =>
                  this.genomeStore.sequenceUidLookup[d.uid]  *
                  (this.barHeight + 10)
              )
              // .attr('width', function (d) {
              //   return vis.xScale(d.sequence_length)
              // })
              .attr('width', (d) =>
                this.anchor
                  ? this.xScale(70000000)
                  : vis.xScale(d.sequence_length_nuc)
              )
              .attr('height', this.barHeight / 4)
              .attr('fill', function (d) {
                let color
                color = 'transparent'
                return color
              })
              .attr('opacity', function (d) {
                let color
                if (vis.percentageGC == true) {
                  color = 1
                } else {
                  color = 0
                }
                return color
              })
              .attr('clip-path', 'url(#clipDetails)'),
          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('x', this.anchor ? this.xScale(-35000000) : this.xScale(0))
              .attr('fill', function (d) {
                let color
                color = 'transparent'
                return color
              })
              .attr('opacity', function (d) {
                let color
                if (vis.percentageGC == true) {
                  color = 1
                } else {
                  color = 0
                }
                return color
              })
              .attr(
                'y',
                (d, i) =>
                  this.genomeStore.sequenceUidLookup[d.uid]  *
                  (this.barHeight + 10)
              )
              .attr('width', (d) =>
                this.anchor
                  ? this.xScale(70000000)
                  : vis.xScale(d.sequence_length_nuc)
              ),
          (exit) => exit.remove()
        )
    },
    drawSquishBars() {
      let vis = this
      if (this.genomeStore.genomeData.genes === undefined) {
        return
      }
      this.svg()
        .selectAll('path.bar-chr-context')
        .data(this.genomeStore.genomeData.genes ?? [])
        .join(
          (enter) =>
            enter
              .append('path')
              .attr(
                'transform',
                `translate(${0} ,${this.margin.top * 2})`
              )
              .attr('class', 'bar-chr-context')
              .attr('d', (d) => {
                 
                const key: string = d.sequence_uid ?? ''
                const position = d.end

                const geneIndex = this.genomeStore.sequenceUidLookup[d.uid]
                const ypos =
                  geneIndex  *
                  (this.barHeight + 10)

                const currentGeneToWindowScale = this.geneToWindowScales[key]
                const currentGeneToCompressionScale =
                  geneToCompressionScales.value[key]
                const width = calculateWidth(
                  currentGeneToCompressionScale,
                  currentGeneToWindowScale,
                  this.windowRange,
                  position
                )
                const defaultConnectionThickness = 8

                const x0 = this.geneToWindowScales[key](position)
                const x1controlStart = x0 + (width * 3) / 7
                const x1controlEnd = x0 + (width * 4) / 7
                const x1 = x0 + width / 2
                const x2 = x0 + width
                const x3 = x2
                const x4 = x1
                const x5 = x0
                const x6 = x0

                const y0 =
                  ypos + this.barHeight / 2 - defaultConnectionThickness / 2
                const y1 = y0 - 10
                const y2 = y0
                const y3 =
                  ypos + this.barHeight / 2 + defaultConnectionThickness / 2
                const y4 = y3 + 10
                const y5 = y3
                const y6 = y0

                const compressionFactor = calculateCompressionFactor(
                  currentGeneToCompressionScale,
                  position
                ) // globalCompressionFactor.value
                const beta = Math.min(Math.sqrt(compressionFactor) / 10, 1)
                const lineUpper: string =
                  d3.line().curve(d3.curveBundle.beta(beta))([
                    [x0, y0],
                    [x1controlStart, y0],
                    [x1, y1],
                    [x1controlEnd, y0],
                    [x2, y2],
                  ]) ?? ''
                const lineConnect = d3.line()([
                  [x6, y6],
                  [x2, y2],
                  [x3, y3],
                  [x5, y5],
                  [x6, y6],
                ])
                const lineLower: string =
                  d3.line().curve(d3.curveBundle.beta(beta))([
                    [x3, y3],
                    [x1controlEnd, y3],
                    [x4, y4],
                    [x1controlStart, y3],
                    [x5, y5],
                  ]) ?? ''

                const line = lineUpper + lineLower + lineConnect
                return line
              })
              .attr('fill', (d) => {
                if (vis.colorGenomes == true) {
                  return vis.colorScaleGenome(String(d.sequence_id)) as string
                }
                return 'lightgray'
              })
              .attr('opacity', () => {
                if (vis.colorGenomes == true) {
                  return 0.5
                }
                return 1
              })
              .attr('clip-path', 'url(#clipDetails)'),
          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('d', (d) => {
                const key: string = d.sequence_uid ?? ''
                const position = d.end
                const compressionPosition =
                  geneToCompressionScales.value[key](position)
                // const compressionPosition = genePositionCompression
                const genePosition =
                  geneToCompressionScales.value[key].invert(compressionPosition)
                const index = vis.indexMap.get(this.genomeStore.sequenceUidLookup[key]) ?? 0
                const ypos = index * (this.barHeight + 10)

                const currentGeneToWindowScale = this.geneToWindowScales[key]
                const currentGeneToCompressionScale =
                  geneToCompressionScales.value[key]
                const width = calculateWidth(
                  currentGeneToCompressionScale,
                  currentGeneToWindowScale,
                  this.windowRange,
                  position
                )
                const defaultConnectionThickness = 2
                const x0 = this.geneToWindowScales[key](genePosition)
                const x1controlStart = x0 + (width * 3) / 7
                const x1controlEnd = x0 + (width * 4) / 7
                const x1 = x0 + width / 2
                const x2 = x0 + width
                const x3 = x2
                const x4 = x1
                const x5 = x0
                const x6 = x0

                const y0 =
                  ypos + this.barHeight / 2 - defaultConnectionThickness / 2
                const y1 = y0 - 10
                const y2 = y0
                const y3 =
                  ypos + this.barHeight / 2 + defaultConnectionThickness / 2
                const y4 = y3 + 10
                const y5 = y3
                const y6 = y0

                const compressionFactor =
                  calculateCompressionFactor(
                    currentGeneToCompressionScale,
                    position
                  ) / globalCompressionFactor.value
                if (compressionFactor < 1) {
                  const yTopMod =
                    ypos +
                    Math.min(1 - compressionFactor, 1) *
                      (defaultConnectionThickness / 2)
                  const yBottomMod =
                    y3 -
                    Math.min(1 - compressionFactor, 1) *
                      (defaultConnectionThickness / 2)

                  const lineConnect = d3.line()([
                    [x6, yTopMod],
                    [x2, yTopMod],
                    [x3, yBottomMod],
                    [x5, yBottomMod],
                    [x6, yTopMod],
                  ])

                  return lineConnect
                }
                const beta = Math.min(Math.sqrt(compressionFactor) / 10, 1)
                const lineUpper: string =
                  d3.line().curve(d3.curveBundle.beta(beta))([
                    [x0, y0],
                    [x1controlStart, y0],
                    [x1, y1],
                    [x1controlEnd, y0],
                    [x2, y2],
                  ]) ?? ''
                const lineConnect = d3.line()([
                  [x6, y6],
                  [x2, y2],
                  [x3, y3],
                  [x5, y5],
                  [x6, y6],
                ])
                const lineLower: string =
                  d3.line().curve(d3.curveBundle.beta(beta))([
                    [x3, y3],
                    [x1controlEnd, y3],
                    [x4, y4],
                    [x1controlStart, y3],
                    [x5, y5],
                  ]) ?? ''

                const line = lineUpper + lineLower + lineConnect

                return line //lineUpper + d3.line()([[x2,y2], [x3,y3]]) + lineLower + d3.line()([[x5,y5], [x6,y6]]) // + lineConnect //+ lineConnectStart
              })
              .attr('fill', (d) => {
                if (vis.colorGenomes == true) {
                  return vis.colorScaleGenome(String(d.sequence_id)) as string
                }
                return 'lightgray'
              })
              .attr('opacity', () => {
                if (vis.colorGenomes == true) {
                  return 0.5
                }
                return 1
              }),
          (exit) => exit.remove()
        )
    },
    // Drawing specification starts here ///////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////Draw ////////////////////////////////////
    draw() {
      if (this.chromosomeNr !== 'unphased') {
        // this.drawBars()
        // this.drawContextBars()
        this.drawSquishBars()
        this.drawGenes()
        this.addLabels()

        this.showNotificationsDetail
          ? this.drawNotifications()
          : this.hideNotifications()
      }
    },
    hideNotifications() {
      this.svg().selectAll('circle.density').remove()
      this.svg().selectAll('text.density-value-focus').remove()
    },
    ///////////////////////////////////////////////////////////////////////////////add labels ////////////////////////////////////
    addLabels() {
      let vis = this

      if (this.filteredSequences === undefined) {
        return
      }
      this.svg()
        .selectAll('text.label-seq')
        .data(this.filteredSequences, (d: any) => d.uid)
        .join(
          (enter) =>
            enter
              .append('text')
              .attr('transform', `translate(20,${this.margin.top * 2})`)
              .attr('class', 'label-seq')
              .attr('dominant-baseline', 'hanging')
              .attr('text-anchor', 'end')
              .attr('x', 5)
              .attr('font-size', 10)
              .attr(
                'y',

                function (d, i) {
                  // return vis.mappedIndices[i] * (vis.barHeight + 10)
                  return i * (vis.barHeight + 10)
                }
              )

              .attr('dy', -this.barHeight / 2)
              .text(
                (d, i) =>
                  getSequenceIdByUid(
                    vis.filteredSequences,
                    Object.entries(vis.genomeStore.sequenceUidLookup)[
                      vis.sequenceIndicesInLookup[i]
                    ][0]
                  ) ?? 'undefined' //provide default undefined label if undefined
              ),

          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('y', (d, i) => i * (this.barHeight + 10)),
          (exit) => exit.remove()
        )

      // if (this.genomeStore.genomeData.sequences === undefined) {
      //   return
      // }
      // this.svg()
      //   .selectAll('text.label-seq')
      //   .data(this.genomeStore.genomeData.sequences, (d: any) => d.sequence_id)
      //   .data(this.filteredSequences, (d: any) => d.id)
      //   .join(
      //     (enter) =>
      //       enter
      //         .append('text')
      //         .attr('transform', `translate(20,${this.margin.top * 2})`)
      //         .attr('class', 'label-seq')
      //         .attr('dominant-baseline', 'hanging')
      //         .attr('text-anchor', 'end')
      //         .attr('x', 5)
      //         .attr('font-size', 10)
      //         .attr(
      //           'y',
      //           (d, i) =>
      //             this.genomeStore.sequenceUidLookup[d.uid]  *
      //             (this.barHeight + 10)
      //         )

      //         .attr('dy', this.barHeight / 3)
      //         // .text((d) => d.sequence_id.split('_')),
      //         .text((d) =>
      //           d.phasing_id.includes('unphased')
      //             ? d.genome_number + '_' + 'U'
      //             : d.genome_number + '_' + d.phasing_id.split('_')[1]
      //         ),

      //     (update) =>
      //       update
      //         .transition()
      //         .duration(this.transitionTime)
      //         .attr('y', function (d, i) {
      //           return (
      //             vis.sortedChromosomeSequenceIndices[vis.chromosomeNr][i] *
      //             (vis.barHeight + 10)
      //           )
      //         }),
      //     (exit) => exit.remove()
      //   )
    },
    /////////////////////////////////////////////////////////////////////////////// Add values ////////////////////////////////////
    addValues() {
      if (this.genomeStore.genomeData.sequences === undefined) {
        return
      }
      this.svg()
        .selectAll('text.value-chr')
        .data(this.genomeStore.genomeData.sequences)
        .join(
          (enter) =>
            enter
              .append('text')
              .attr(
                'transform',
                `translate(${this.margin.left},${this.margin.top * 2})`
              )
              .attr('class', 'value-chr')
              .attr('dominant-baseline', 'hanging')
              .attr('x', 0)
              .attr('dx', 2)
              .attr(
                'y',
                (d, i) =>
                  this.genomeStore.sequenceUidLookup[d.uid] *
                  (this.barHeight + 10)
              )
              .attr('dy', this.barHeight / 4)
              .text((d) => Math.floor(d.sequence_length_nuc).toLocaleString()),

          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr(
                'y',
                (d, i) =>
                  this.genomeStore.sequenceUidLookup[d.uid]  *
                  (this.barHeight + 10)
              ),
          (exit) => exit.remove()
        )
    },
    ///////////////////////////////////////////////////////////////////////////////Draw x-axis ////////////////////////////////////
    drawXAxis() {
      this.svg().select('g.x-axis').remove() //needed because otherwise draws twice in some cases. To-do: fix side effect

      this.svg()
        .append('g')
        .attr('class', 'x-axis')
        .attr(
          'transform',
          'translate(' + this.margin.left + this.margin.yAxis + ',' + this.margin.top * 2 + ')'
        )
        .call(
          d3
            .axisTop(this.xScale)
            // .tickValues(this.ticksXdomain)
            .tickFormat(d3.format('~s'))
        )
        .call((g) => g.select('.domain').remove())
        .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
        .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))
    },

    ///////////////////////////////////////////////////////////////////////////// Draw genes ////////////////////////////////////////////////
    drawGenes() {
      let vis = this

      if (this.genomeStore.genomeData.genes === undefined) {
        return
      }
      const genes: Gene[] = this.genomeStore.genomeData.genes

      /// connection lines
      this.svg().selectAll('path.connection').remove()
      let currentHomologyGroups = this.homologyGroups

      if (this.showLinks === false) {
        currentHomologyGroups = this.homologyGroups.filter((d) =>
          crossingHomologyGroups.value.includes(d)
        )
      }
      // draw the lines
      currentHomologyGroups.forEach((homology) => {
        const path_focus = genes.filter(
          (d) => d.homology_groups[0].id == homology //this.homologyFocus
        )

        const newPathFocus = path_focus.map((v) => ({
          ...v,
          sequence_id: v.sequence_uid ?? '',
        }))

        let sortOrder = Object.keys(this.sequenceIdLookup[this.chromosomeNr])

        let sortedPath = [...newPathFocus].sort(function (a, b) {
          return (
            sortOrder.indexOf(a.sequence_id) - sortOrder.indexOf(b.sequence_id)
          )
        })

        let connectionsLine = (sortedPath: (Gene)[]) => {
          const currentPath = d3.path()
          let previousWasRendered = false
          sortedPath.forEach((node, i) => {
            const key = node.sequence_uid ?? ''
            const currentGeneToWindow = this.geneToWindowScales[key]
            const nodePosition =
              (currentGeneToWindow(node.start) +
                currentGeneToWindow(node.end)) /
                2
            const y =
              vis.margin.top * 2 +
              vis.barHeight / 2 +
              vis.sequenceIdLookup[vis.chromosomeNr][key] * (vis.barHeight + 10)
            if (
              nodePosition < this.windowRange[0] ||
              nodePosition > this.windowRange[1]
            ) {
              previousWasRendered = false
              currentPath.moveTo(nodePosition, y)
            } else if (previousWasRendered === false) {
              currentPath.moveTo(nodePosition, y)
              previousWasRendered = true
            } else {
              previousWasRendered = true
              currentPath.lineTo(nodePosition, y)
            }
          })
          return currentPath
        }

        // Add the line
        if (vis.colorGenes !== true) {
          this.svg()
            .append('path')
            .datum(sortedPath)
            .attr('class', 'connection')
            .attr('fill', 'none')
            .attr('stroke', (d) =>
              vis.colorGenes
                ? (vis.colorScale(String(homology)) as string)
                : colors['gray-7']
            )
            .attr('stroke-width', 1.5)
            .attr('d', (d) => connectionsLine(d).toString())
        }
      })

      const geneSymbol = d3
        .symbol()
        .size((d: Gene) => {
          const key = d.sequence_uid ?? ''

          const currentGeneToWindow = this.geneToWindowScales[key]
          if(currentGeneToWindow === undefined){
            return 0
          }
          const size = getGeneSymbolSize(
            d,
            currentGeneToWindow,
            vis.barHeight,
            showGeneBars.value
          )
          if (
            currentGeneToWindow(d.start) > this.windowRange[1] ||
            currentGeneToWindow(d.end) < this.windowRange[0]
          ) {
            return 0
          }
          return size
        })
        .type((d) => {
          const key = d.sequence_uid ?? ''
          const currentGeneToWindow = this.geneToWindowScales[key]
          return getGeneSymbolType(
            d,
            currentGeneToWindow,
            vis.barHeight,
            showGeneBars.value
          )
        })

      this.svg()
        .selectAll('path.gene')
        .data(vis.filteredGenes)
        .join(
          (enter) =>
            enter
              .append('path')
              .attr('d', geneSymbol)
              .attr('transform', function (d, i) {

                const sequence = d.sequence_uid 
                let xTransform = vis.geneToWindowScales[sequence ?? ''](d.start + (d.end - d.start) / 2)
                let drawingIndex =
                  vis.indexMap.get(
                    vis.genomeStore.sequenceUidLookup[sequence ?? '']
                  ) ?? 0
                let yTransform =  drawingIndex * (vis.barHeight + 10) + 2 * vis.margin.top + vis.barHeight/2
                let rotation = d.strand === 0 ? 0 : 180
                return `translate(${xTransform},${yTransform}) rotate(${rotation})`
              })
              .attr('class', 'gene')
              .attr(
                'hg',
                (d: Gene) => d.homology_groups?.map((entry) => entry.id) ?? []
              )
              .attr('z-index', 1000)
              .attr('stroke-width', '3px')
              .attr('fill', colors['gray-7'])
              .attr('opacity', 0.8),
          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('transform', (d) => {
                const key = d.sequence_uid ?? '' //vis.geneToLocusSequenceLookup.get(d.uid)?.sequence
                let xTransform = this.geneToWindowScales[key](d.start + (d.end - d.start) / 2)
                let drawingIndex =
                  vis.indexMap.get(
                    vis.genomeStore.sequenceUidLookup[key]
                  ) ?? 0
                let yTransform = drawingIndex * (vis.barHeight + 10) + 2 * this.margin.top + this.barHeight/2
                let rotation = d.strand === 0 ? 0 : 180
                return `translate(${xTransform},${yTransform}) rotate(${rotation})`
              })
              .attr('d', geneSymbol)
              .attr('z-index', 1000)
              .attr('fill', d => {
              return vis.colorGenes
              ? vis.colorScale(String(d.homology_groups[0].uid)) as string
              : 'gray'
              }),
              // .attr('fill', colors['gray-7']),
          (exit) => exit.remove()
        )

      // this.svg()
      //   .selectAll('path.gene')
      //   .data(this.genes, (d) => d.mRNA_id)
      //   .join((enter) =>
      //     enter
      //       .append('path')
      //       .attr('d', geneSymbol)
      //       .attr('transform', function (d, i) {
      //         const key = `${d.genome_number}_${d.sequence_number}`
      //         const currentScale = vis.geneToWindowScales[key]
      //         let startPosition = vis.anchor
      //           ? currentScale(d.mRNA_start_position - vis.anchorLookup[key])
      //           : currentScale(d.mRNA_start_position)
      //         let endPosition = vis.anchor
      //           ? currentScale(d.mRNA_end_position - vis.anchorLookup[key])
      //           : currentScale(d.mRNA_end_position)
      //         let xTransform =
      //           vis.margin.left * 3 + (startPosition + endPosition) / 2
      //         let yTransform =
      //           vis.margin.top * 2 +
      //           vis.barHeight / 2 +
      //           vis.sortedMrnaIndices[vis.chromosomeNr][i] *
      //             (vis.barHeight + 10)
      //         return `translate(${xTransform},${yTransform})`
      //       })
      //       .attr('class', 'gene')
      //       .attr('hg', (d: GroupInfo) => d.homology_id ?? 0)
      //       .attr('z-index', 100)
      //       .attr('stroke', (d): string =>
      //         vis.colorGenes
      //           ? vis.upstreamHomologies.includes(d.homology_id)
      //             ? (this.colorScale(String(d.homology_id)) as string)
      //             : ''
      //           : ''
      //       )
      //       .attr('stroke-width', (d) => '3px')
      //       .attr('fill', (d) => {
      //         return vis.colorGenes
      //           ? (vis.colorScale(String(d.homology_id)) as string)
      //           : colors['gray-7']
      //       })
      //       .attr('opacity', 0.8)

      //     (update) =>
      //       update
      //         .transition()
      //         .duration(this.transitionTime)
      //         .attr('transform', function (d, i) {
      //           const key = `${d.genome_number}_${d.sequence_number}`
      //           const currentScale = vis.geneToWindowScales[key]
      //           let startPosition = vis.anchor
      //             ? currentScale(d.mRNA_start_position - vis.anchorLookup[key])
      //             : currentScale(d.mRNA_start_position)
      //           let endPosition = vis.anchor
      //             ? currentScale(d.mRNA_end_position - vis.anchorLookup[key])
      //             : currentScale(d.mRNA_end_position)
      //           let xTransform =
      //             vis.margin.left * 3 + (startPosition + endPosition) / 2
      //           let yTransform =
      //             vis.margin.top * 2 +
      //             vis.barHeight / 2 +
      //             vis.sortedMrnaIndices[vis.chromosomeNr][i] *
      //               (vis.barHeight + 10)
      //           return `translate(${xTransform},${yTransform})`
      //         })
      //         .attr('d', geneSymbol)
      //         .attr('fill', (d) => {
      //           return vis.colorGenes
      //             ? (vis.colorScale(String(d.homology_id)) as string)
      //             : colors['gray-7']
      //         })
      //         .attr('stroke-width', (d) => '3px')
      //         .attr('stroke', (d) =>
      //           vis.colorGenes
      //             ? (vis.colorScale(String(d.homology_id)) as string)
      //             : colors['gray-7']
      //         ),
      //     //   vis.colorGenes
      //     //     ? vis.upstreamHomologies.includes(d.homology_id ?? 0)
      //     //       ? vis.colorScale(String(d.homology_id))
      //     //       : ''
      //     //     : ''
      //     // ),

      //     (exit) => exit.remove()
      //   )
    },

    //////////////////////////////////////////////////////////////////// Draw notifications //////////////////////////////////////
    // drawNotifications() {
    //   let vis = this
    //   const genes = useGenomeStore().genomeData.genes
    //   if (genes === undefined) {
    //     const densityObjects = groupInfoDensity(genes)

    //     const dataDensity = {}
    //     Object.keys(densityObjects).forEach((key) => {
    //       dataDensity[key] = densityObjects[key].map(
    //         (item) => item.start
    //       )
    //     })
    //     console.log('densityData', dataDensity)

    //     const thresholds = this.xScale.ticks(100) //to-do: make configurable?
    //     console.log('thresholds', thresholds)

    //     let allBins = []
    //     Object.keys(dataDensity).forEach((key) => {
    //       const bins = d3
    //         .bin()
    //         .domain(vis.xScale.domain())
    //         .thresholds(thresholds)(dataDensity[key])

    //       //first filter bins
    //       const binsFiltered = bins.filter((bin) => bin.length > 1)
    //       const binsFilteredwithSeq = binsFiltered.map((bin) => ({
    //         ...bin,
    //         sequence_id: key,
    //       }))

    //       allBins = allBins.concat(binsFilteredwithSeq)
    //     })
    //     console.log('allBins', allBins)

    //     this.svg()
    //       .selectAll('circle.density')
    //       .data(allBins, (d) => d.sequence_id)
    //       .join(
    //         (enter) =>
    //           enter
    //             .append('circle')
    //             .attr(
    //               'transform',
    //               `translate(${this.margin.left * 3},${
    //                 this.margin.top * 3 + vis.barHeight
    //               })`
    //             )

    //             .attr('class', 'density')
    //             .attr(
    //               'cx',
    //               (d) =>
    //                 this.xScale(d.x0) +
    //                 (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
    //             )
    //             .attr('cy', (d, i) => {
    //               return (
    //                 (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
    //                   1) *
    //                 (this.barHeight + 10)
    //               )
    //             })
    //             .attr('r', 7),
    //         (update) =>
    //           update
    //             .transition()
    //             .duration(this.transitionTime)
    //             .attr(
    //               'cx',
    //               (d) =>
    //                 this.xScale(d.x0) +
    //                 (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
    //             )
    //             .attr('cy', (d, i) => {
    //               return (
    //                 (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
    //                   1) *
    //                 (this.barHeight + 10)
    //               )
    //             }),

    //         (exit) => exit.remove()
    //       )

    //     this.svg()
    //       .selectAll('text.density-value-focus')
    //       .data(allBins, (d) => d.sequence_id)
    //       .join(
    //         (enter) =>
    //           enter
    //             .append('text')

    //             .attr(
    //               'transform',
    //               `translate(${this.margin.left * 3},${
    //                 this.margin.top * 3 + this.barHeight
    //               })`
    //             )
    //             .attr('class', 'density-value-focus')
    //             .attr('text-anchor', 'middle')
    //             .attr('dominant-baseline', 'hanging')
    //             .attr(
    //               'x',
    //               (d) =>
    //                 this.xScale(d.x0) +
    //                 (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
    //             )
    //             .attr('dy', -4)
    //             .attr('y', (d, i) => {
    //               return (
    //                 (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
    //                   1) *
    //                 (this.barHeight + 10)
    //               )
    //             })
    //             .text(
    //               (d) =>
    //                 Object.keys(d).filter(
    //                   (i) => i !== 'x0' && i !== 'x1' && i !== 'sequence_id'
    //                 ).length
    //             ),
    //         (update) =>
    //           update
    //             .transition()
    //             .duration(this.transitionTime)
    //             .attr(
    //               'x',
    //               (d) =>
    //                 this.xScale(d.x0) +
    //                 (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
    //             )
    //             .attr('dy', -4)
    //             .attr('y', (d, i) => {
    //               return (
    //                 (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
    //                   1) *
    //                 (this.barHeight + 10)
    //               )
    //             }),

    //         (exit) => exit.remove()
    //       )
    //   }
    // },
  },
  mounted() {
    const contentElement = document.getElementById('content-focus')
    this.svgWidth =
      (contentElement?.offsetWidth || 0) * this.svgWidthScaleFactor

    this.svgHeight = contentElement?.clientHeight ?? 1000

    // if (this.chromosomeNr == 'unphased') {
    //   this.sortedChromosomeSequenceIndices[12].length * (this.barHeight + 10) +
    //     this.margin.top * 2
    // } else {
    //   this.svgHeight = contentElement?.offsetHeight || 0
    //   // this.svgHeight = document.getElementById('content-focus').offsetHeight
    // }

    // Anchor
    ////
    //1.find all cdf 1
    const homologyAnchor = this.genomeStore.genomeData.genes.filter(
      (gene) => gene.homology_groups[0].id === this.homologyFocus
    )

    let newAnchorLookup: Dictionary<number> = {}
    homologyAnchor?.forEach((item) => {
      const key = item.uid
      newAnchorLookup[key] = 0 //item.mRNA_start_position
    })

    anchorLookup.value = newAnchorLookup
    console.log('this.anchorLookup', anchorLookup)
    console.log('homologyanchor', homologyAnchor)

    const divergentScale = this.genomeStore.genomeData.genes.map((item) => {
      const key = item.sequence_uid ?? ''
      const anchorValue = newAnchorLookup[key]
      return item.start - anchorValue
    })

    let newAnchorMin = d3.min(divergentScale)
    anchorMin.value = newAnchorMin ?? 0

    let newAnchorMax = d3.max(divergentScale)
    anchorMax.value = newAnchorMax ?? 0

    // Create individual scales
    ///
    // let [newGenePositions, nodeGroups]: [GraphNode[], GraphNodeGroup[]] =
    //   runSpringSimulation(
    //     this.genomeStore.genomeData.genes ?? [],
    //     this.genomeStore.genomeData.sequences ?? [],
    //     currentHeat.value,
    //     0.5,
    //     232273529
    //   )

    let [newGenePositions, nodeGroups]: [GraphNode[], GraphNodeGroup[]] =
      runSpringSimulation(
        this.filteredGenes ?? [],
        this.filteredSequences ?? [],
        currentHeat.value,
        0.5,
        736740
      )

    crossingHomologyGroups.value = crossDetection(newGenePositions)

    let xScaleGeneToWindowInit: Dictionary<
      d3.ScaleLinear<number, number, never>
    > = {}
    let xScaleGeneToCompressionInit: Dictionary<
      d3.ScaleLinear<number, number, never>
    > = {}
    //determine global ranges'
    const sortedCompressionRangeGlobal = newGenePositions
      .map((d) => d.position)
      .sort((a, b) => a - b)
    const edgesOfNewRangeGlobal: [number, number] = [
      sortedCompressionRangeGlobal[0],
      sortedCompressionRangeGlobal[sortedCompressionRangeGlobal.length - 1],
    ]
    const oldRanges = newGenePositions
      .map((d) => d.originalPosition)
      .sort((a, b) => a - b)
    const edgesOfOldRange = [oldRanges[0], oldRanges[oldRanges.length - 1]]
    const overallCompressionFactor =
      (edgesOfOldRange[1] - edgesOfOldRange[0]) /
      (edgesOfNewRangeGlobal[1] - edgesOfNewRangeGlobal[0])
    globalCompressionFactor.value = overallCompressionFactor
    compressionViewWindowRange.value = edgesOfNewRangeGlobal

    this.genomeStore.genomeData.sequences.forEach((sequence) => {
      const key = sequence.uid
      const genePositionsOnSequence = newGenePositions
        .filter((d) => String(d.sequenceId) === key)
        .sort((d) => d.originalPosition)

      const [geneToCompression, scaleGeneToWindow] = calculateIndividualScales(
        genePositionsOnSequence,
        edgesOfNewRangeGlobal,
        this.windowRange
      )
      const range = geneToCompression.range()
      const domain = geneToCompression.domain()
      xScaleGeneToCompressionInit[key] = geneToCompression
      xScaleGeneToWindowInit[key] = scaleGeneToWindow
    })
    //assign scale dictionaries
    geneToCompressionScales.value = xScaleGeneToCompressionInit

    this.drawXAxis() // draw axis once
    this.draw()

    // Add brushing
    var newBrush = d3
      .brushX() // Add the brush feature using the d3.brush function
      .extent([
        [this.windowRange[0], 0],
        [
          this.windowRange[1] ,
          this.visHeight,
        ],
      ])
      .on('end', this.updateChartBrushing)

    brush.value = newBrush

    var zoom = d3.zoom().on('zoom', this.updateZoom)
    const selection = d3.select(document.getElementById('content-focus'))
    selection.call(zoom)
    // this.call(zoom)
    // Add brushing
    this.svg().append('g').attr('class', 'brush').call(brush.value)

    this.addClipPath()
    this.resetZoom()
    this.pan()

    this.observeWidth()

    var fisheyeO = {
      circular: () => {
        var radius = 200,
          distortion = 2,
          k0: number,
          k1: number,
          focus = [0, 0]

        function fisheye(d: { x: number; y: number; }) {
          var dx = d.x - focus[0],
            dy = d.y - focus[1],
            dd = Math.sqrt(dx * dx + dy * dy)
          if (!dd || dd >= radius)
            return { x: d.x, y: d.y, z: dd >= radius ? 1 : 10 }
          var k = ((k0 * (1 - Math.exp(-dd * k1))) / dd) * 0.75 + 0.25
          return {
            x: focus[0] + dx * k,
            y: focus[1] + dy * k,
            z: Math.min(k, 10),
          }
        }

        function rescale() {
          k0 = Math.exp(distortion)
          k0 = (k0 / (k0 - 1)) * radius
          k1 = distortion / radius
          return fisheye
        }

        fisheye.radius = function (_: string | number) {
          if (!arguments.length) return radius
          radius = +_
          return rescale()
        }

        fisheye.distortion = function (_: string | number) {
          if (!arguments.length) return distortion
          distortion = +_
          return rescale()
        }

        fisheye.focus = function (_: number[]) {
          if (!arguments.length) return focus
          focus = _
          return fisheye
        }

        return rescale()
      },
    }

    // const fisheye = fisheyeO.circular().radius(100).distortion(5)

    // console.log('fisheye', fisheye)
    // debugger
  },
  // unmounted() {
  //   this.resizeObserver?.disconnect()
  // },
  watch: {
    //Watch for updates to `mappedIndices` before redrawing
    filteredGenes: {
      handler(newVal) {
        console.log('filteredGenes updated:', newVal)
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    mappedIndices: {
      handler(newVal) {
        console.log('mappedIndices updated:', newVal)
        this.addLabels()
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    indexMap: {
      handler(newVal) {
        console.log('indexMap updated:', newVal)
        this.addLabels()
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    sequenceIndicesInLookup: {
      handler(newVal) {
        console.log('sequenceIndicesInLookup updated:', newVal)
        this.addLabels()
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    colorGenes() {
      this.drawGenes()
    },
    showLinks() {
      this.drawGenes()
    },
    anchor() {
      this.svg().select('g.x-axis').remove()
      this.drawXAxis() // redraw
      this.drawGenes()
    },
    showNotificationsDetail() {
      this.draw()
    },
    colorGenomes() {
      console.log('color genomes')
      this.drawBars()
    },
    percentageGC() {
      console.log('show GC')
      this.drawContextBars()
    },
    sortedChromosomeSequenceIndices() {
      this.draw()
    },
    numberOfChromosomes() {
      this.svg().select('g.x-axis').remove()
      this.drawXAxis() // redraw
      this.draw()
    },
    svgWidth() {
      this.svg().select('g.x-axis').remove()
      this.drawXAxis() // redraw
      this.draw()
    },
  },
}
</script>

<style lang="scss">
@import '@/assets/colors.module.scss';

.cell-chr {
  -webkit-filter: drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.1));
  filter: drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.1));
}

// .bar-chr {
//   fill: $gray-9;
//   transition: r 0.2s ease-in-out;
// }
// .bar-chr:hover {
//   fill: $gray-7;
// }

.value-chr {
  fill: #c0c0c0;
  font-size: 8;
  font-family: sans-serif;
}

.density {
  fill: #ff4d4f;
  z-index: 200 !important;
}

.density-value-focus {
  fill: white;
  font-weight: 500;
  font-size: 11px;
  font-family: sans-serif;
}

.density-value {
  fill: white;
  font-weight: 500;
  font-size: 11px;
  font-family: sans-serif;
}

.zoom {
  fill: none;
  stroke-width: 1px;
  stroke: black;
}

.label-seq {
  fill: #c0c0c0;
  font-size: 12;
  font-family: sans-serif;
}

.asterisk {
  stroke: red;
  stroke-width: 2px;
}
</style>

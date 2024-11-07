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
import { defineComponent, ref, watch } from 'vue'

import colors from '@/assets/colors.module.scss'
import {
  calculateCompressionFactor,
  calculateIndividualScales,
  calculateWidth,
  updateViewportRangeBounds,
} from '@/helpers/axisStretch'
import { groupInfoDensity } from '@/helpers/chromosome'
import { crossDetection } from '@/helpers/crossDetection'
import { getGeneSymbolSize, getGeneSymbolType } from '@/helpers/customSymbols'
import { runSpringSimulation } from '@/helpers/springSimulation'
import type { GraphNode, GraphNodeGroup } from '@/helpers/springSimulationUtils'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGenomeStore } from '@/stores/geneSet'
import type { GroupInfo, SequenceInfo, SequenceMetrics } from '@/types'

// states
const compressionViewWindowRange = ref<[number, number]>([0, 1])
const geneToCompressionScales = ref<
  Dictionary<d3.ScaleLinear<number, number, never>>
>({})
const globalCompressionFactor = ref<number>(1)
const currentHeat = ref<number>(1000)
const crossingHomologyGroups = ref<number[]>([])
const showGeneBars = ref<boolean>(true)

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
    const mappedIndices = ref<number[]>([])

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
        // addLabels()
        const sequenceIndicesInLookup = filteredSequences.value.map(
          (sequence) => {
            return genomeStore.sequenceUidLookup[sequence.uid]
          }
        )

        console.log(
          'Indices of filtered sequences in sequenceUidLookup:',
          sequenceIndicesInLookup
        )

        const indexMap = new Map(
          sequenceIndicesInLookup.map((value, idx) => [value, idx])
        )
        mappedIndices.value = sequenceIndicesInLookup.map(
          (index) => indexMap.get(index) ?? 0
        )

        console.log('mappedIndices: ', mappedIndices.value) // Output: [0, 1, 2]
      },
      { immediate: true }
    )

    return {
      filteredSequences,
      mappedIndices,
      genomeStore,
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
      return [this.margin.left, this.visWidth - this.margin.left]
    },
    xScale() {
      return this.anchor
        ? d3
            .scaleLinear()
            .domain([-this.anchorMax, this.anchorMax])
            .nice()
            .rangeRound([
              0,
              this.visWidth - this.margin.yAxis + this.margin.left * 4,
            ])
        : d3
            .scaleLinear()
            .domain([this.dataMin > 0 ? 0 : this.dataMin, this.dataMax])
            .nice()
            .rangeRound([
              0,
              this.visWidth - this.margin.yAxis + this.margin.left * 4,
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
      Object.entries(geneToCompressionScales.value).forEach((scaleEntry) => {
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
    updateChartBrushing({ selection }): NodeJS.Timeout | undefined {
      console.log('brush selection', selection)

      // If no selection, back to initial coordinate. Otherwise, update X axis domain
      if (!selection) {
        return
      }
      console.log(
        'range',
        this.xScale.invert(selection[0] - this.margin.left * 3),
        this.xScale.invert(selection[1] - this.margin.left * 3)
      )

      this.xScale.domain([
        this.xScale.invert(selection[0] - this.margin.left * 3),
        this.xScale.invert(selection[1] - this.margin.left * 3),
      ])
      const globalRangeWidth =
        compressionViewWindowRange.value[1] -
        compressionViewWindowRange.value[0]
      const currentGlobalRangeBounds: [number, number] =
        compressionViewWindowRange.value
      const rangeWidth = this.windowRange[1] - this.windowRange[0]
      const selectionPercentages = [
        (selection[0] - this.margin.yAxis) / rangeWidth,
        (selection[1] - this.margin.yAxis) / rangeWidth,
      ]
      const newRangeBoundsGlobal: [number, number] = [
        currentGlobalRangeBounds[0] +
          selectionPercentages[0] * globalRangeWidth,
        currentGlobalRangeBounds[0] +
          selectionPercentages[1] * globalRangeWidth,
      ]
      compressionViewWindowRange.value = newRangeBoundsGlobal

      this.svg().select('.brush').call(this.brush.move, null) // This remove the grey brush area as soon as the selection has been done
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
          vis.xScale.domain([-vis.anchorMax, vis.anchorMax]).nice()

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
      this.idleTimeout = null
    },

    ///////////////////////////////////////////////////////////////////////////////update zoom ////////////////////////////////////
    updateZoom(zoomEvent) {
      if (!zoomEvent) {
        return
      }
      if (zoomEvent.sourceEvent.type !== 'wheel') {
        return
      }

      // calculate new bounds for the range
      const zoomCenterX = zoomEvent.sourceEvent.pageX
      const percentageZoomLeft =
        (zoomCenterX -
          this.windowRange[0] -
          this.margin.yAxis -
          this.margin.left * 3) /
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
        .call(d3.axisTop(this.xScale))
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
        .data(this.data ?? [], (d: any) => d.sequence_id)
        .join(
          (enter) =>
            enter
              .append('rect')
              .attr(
                'transform',
                `translate(${this.margin.left * 3},${this.margin.top * 2})`
              )
              .attr('class', 'bar-chr')
              .attr('x', this.xScale(0))
              .attr(
                'y',
                (d, i) =>
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr][i] *
                  (this.barHeight + 10)
              )
              .attr(
                'width',
                (d) => vis.xScale(d.sequence_length) - vis.xScale(0)
              )
              .attr('height', this.barHeight)

              .attr('fill', (d) => {
                let color: any
                if (vis.colorGenomes == true) {
                  color = vis.colorScaleGenome(String(d.genome_number))
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
                  color = vis.colorScaleGenome(String(d.genome_number))
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
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr][i] *
                  (this.barHeight + 10)
              )
              .attr(
                'width',
                (d) => vis.xScale(d.sequence_length) - vis.xScale(0)
              ),

          (exit) => exit.remove()
        )
    },
    ///////////////////////////////////////////////////////////////////////////////Draw context bars ////////////////////////////////////
    drawContextBars() {
      let vis = this
      if (this.data === undefined) {
        return
      }
      this.svg()
        .selectAll('rect.bar-chr-context')
        .data(this.data, (d: any) => d.sequence_id)
        .join(
          (enter) =>
            enter
              .append('rect')
              .attr(
                'transform',
                `translate(${this.margin.left * 3},${this.margin.top * 2})`
              )
              .attr('class', 'bar-chr-context')
              .attr('x', this.anchor ? this.xScale(-35000000) : this.xScale(0))
              .attr(
                'y',
                (d, i) =>
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr][i] *
                  (this.barHeight + 10)
              )
              // .attr('width', function (d) {
              //   return vis.xScale(d.sequence_length)
              // })
              .attr('width', (d) =>
                this.anchor
                  ? this.xScale(70000000)
                  : vis.xScale(d.sequence_length)
              )
              .attr('height', this.barHeight / 4)
              .attr('fill', function (d) {
                let color
                if (vis.percentageGC == true) {
                  color = vis.colorScaleGC(d.GC_content_percent)
                } else {
                  color = 'transparent'
                }
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
                if (vis.percentageGC == true) {
                  color = vis.colorScaleGC(d.GC_content_percent)
                } else {
                  color = 'transparent'
                }
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
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr][i] *
                  (this.barHeight + 10)
              )
              .attr('width', (d) =>
                this.anchor
                  ? this.xScale(70000000)
                  : vis.xScale(d.sequence_length)
              ),
          (exit) => exit.remove()
        )
    },
    drawSquishBars() {
      let vis = this
      if (vis.dataGenes === undefined) {
        return
      }
      this.svg()
        .selectAll('path.bar-chr-context')
        .data(vis.dataGenes ?? [])
        .join(
          (enter) =>
            enter
              .append('path')
              .attr(
                'transform',
                `translate(${this.margin.left * 3},${this.margin.top * 2})`
              )
              .attr('class', 'bar-chr-context')
              .attr('d', (d) => {
                const key: string = `${d.genome_number}_${d.sequence_number}`
                const position = d.mRNA_end_position

                const index =
                  vis.data?.findIndex(
                    (sequence) => sequence.sequence_id === key
                  ) ?? 0
                const ypos =
                  vis.sortedChromosomeSequenceIndices[vis.chromosomeNr][index] *
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
                  return vis.colorScaleGenome(String(d.genome_number)) as string
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
                const key: string = `${d.genome_number}_${d.sequence_number}`
                const position = d.mRNA_end_position
                const genePositionCompression =
                  geneToCompressionScales.value[key](position)
                const compressionPosition = genePositionCompression
                const genePosition =
                  geneToCompressionScales.value[key].invert(compressionPosition)

                const index =
                  vis.data?.findIndex(
                    (sequence) => sequence.sequence_id === key
                  ) ?? 0
                const ypos =
                  vis.sortedChromosomeSequenceIndices[vis.chromosomeNr][index] *
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
                  return vis.colorScaleGenome(String(d.genome_number)) as string
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
      console.log('adding sequence labels', this.filteredSequences)

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
              .attr('y', (d, i) => i * (this.barHeight + 10))

              .attr('dy', -this.barHeight / 2)
              // .text((d) => d.sequence_id.split('_')),
              .text((d) => d.id),

          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('y', (d, i) => i * (this.barHeight + 10)),
          (exit) => exit.remove()
        )

      // if (this.data === undefined) {
      //   return
      // }
      // this.svg()
      //   .selectAll('text.label-seq')
      //   .data(this.data, (d: any) => d.sequence_id)
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
      //             this.sortedChromosomeSequenceIndices[this.chromosomeNr][i] *
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
      if (this.data === undefined) {
        return
      }
      this.svg()
        .selectAll('text.value-chr')
        .data(this.data, (d: any) => d.sequence_id)
        .join(
          (enter) =>
            enter
              .append('text')
              .attr(
                'transform',
                `translate(${this.margin.left * 1},${this.margin.top * 2})`
              )
              .attr('class', 'value-chr')
              .attr('dominant-baseline', 'hanging')
              .attr('x', 0)
              .attr('dx', 2)
              .attr(
                'y',
                (d, i) =>
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr][i] *
                  (this.barHeight + 10)
              )
              .attr('dy', this.barHeight / 4)
              .text((d) => Math.floor(d.sequence_length).toLocaleString()),

          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr(
                'y',
                (d, i) =>
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr ?? 0][
                    i
                  ] *
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
          'translate(' + this.margin.left * 3 + ',' + this.margin.top * 2 + ')'
        )
        .call(
          d3
            .axisTop(this.xScale)
            .tickValues(this.ticksXdomain)
            .tickFormat(d3.format('~s'))
        )
        .call((g) => g.select('.domain').remove())
        .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
        .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))
    },

    ///////////////////////////////////////////////////////////////////////////// Draw genes ////////////////////////////////////////////////
    drawGenes() {
      let vis = this

      if (this.dataGenes === undefined) {
        return
      }
      const genes: GroupInfo[] = this.dataGenes
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
          (d) => d.homology_id == homology //this.homologyFocus
        )

        const newPathFocus = path_focus.map((v) => ({
          ...v,
          sequence_id: `${v.genome_number}_${v.sequence_number}`,
        }))

        let sortOrder = Object.keys(this.sequenceIdLookup[this.chromosomeNr])

        let sortedPath = [...newPathFocus].sort(function (a, b) {
          return (
            sortOrder.indexOf(a.sequence_id) - sortOrder.indexOf(b.sequence_id)
          )
        })

        let connectionsLine = (sortedPath: GroupInfo[]) => {
          const currentPath = d3.path()
          let previousWasRendered = false
          sortedPath.forEach((node, i) => {
            const key = `${node.genome_number}_${node.sequence_number}`
            const currentGeneToWindow = this.geneToWindowScales[key]
            const nodePosition =
              vis.margin.left * 3 +
              (currentGeneToWindow(node.mRNA_start_position) +
                currentGeneToWindow(node.mRNA_end_position)) /
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
        .size((d: GroupInfo) => {
          const key = `${d.genome_number}_${d.sequence_number}`
          const currentGeneToWindow = this.geneToWindowScales[key]
          const size = getGeneSymbolSize(
            d,
            currentGeneToWindow,
            vis.barHeight,
            showGeneBars.value
          )
          if (
            currentGeneToWindow(d.mRNA_start_position) > this.windowRange[1] ||
            currentGeneToWindow(d.mRNA_end_position) < this.windowRange[0]
          ) {
            return 0
          }
          return size
        })
        .type((d) => {
          const key = `${d.genome_number}_${d.sequence_number}`
          const currentGeneToWindow = this.geneToWindowScales[key]
          return getGeneSymbolType(
            d,
            currentGeneToWindow,
            vis.barHeight,
            showGeneBars.value
          )
        })

      console.log('draw genes input', genes)

      this.svg()
        .selectAll('path.gene')
        .data(genes, (d) => d.mRNA_id)
        .join(
          (enter) =>
            enter
              .append('path')
              .attr('d', geneSymbol)
              .attr('transform', function (d, i) {
                const key = `${d.genome_number}_${d.sequence_number}`
                const currentScale = vis.geneToWindowScales[key]
                let startPosition = vis.anchor
                  ? currentScale(d.mRNA_start_position - vis.anchorLookup[key])
                  : currentScale(d.mRNA_start_position)
                let endPosition = vis.anchor
                  ? currentScale(d.mRNA_end_position - vis.anchorLookup[key])
                  : currentScale(d.mRNA_end_position)
                let xTransform =
                  vis.margin.left * 3 + (startPosition + endPosition) / 2
                let yTransform =
                  vis.margin.top * 2 +
                  vis.barHeight / 2 +
                  vis.sortedMrnaIndices[vis.chromosomeNr][i] *
                    (vis.barHeight + 10)
                return `translate(${xTransform},${yTransform})`
              })
              .attr('class', 'gene')
              .attr('hg', (d: GroupInfo) => d.homology_id ?? 0)
              .attr('z-index', 100)
              .attr('stroke', (d): string =>
                vis.colorGenes
                  ? vis.upstreamHomologies.includes(d.homology_id)
                    ? (this.colorScale(String(d.homology_id)) as string)
                    : ''
                  : ''
              )
              .attr('stroke-width', (d) => '3px')
              .attr('fill', (d) => {
                return vis.colorGenes
                  ? (vis.colorScale(String(d.homology_id)) as string)
                  : colors['gray-7']
              })
              .attr('opacity', 0.8),

          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('transform', function (d, i) {
                const key = `${d.genome_number}_${d.sequence_number}`
                const currentScale = vis.geneToWindowScales[key]
                let startPosition = vis.anchor
                  ? currentScale(d.mRNA_start_position - vis.anchorLookup[key])
                  : currentScale(d.mRNA_start_position)
                let endPosition = vis.anchor
                  ? currentScale(d.mRNA_end_position - vis.anchorLookup[key])
                  : currentScale(d.mRNA_end_position)
                let xTransform =
                  vis.margin.left * 3 + (startPosition + endPosition) / 2
                let yTransform =
                  vis.margin.top * 2 +
                  vis.barHeight / 2 +
                  vis.sortedMrnaIndices[vis.chromosomeNr][i] *
                    (vis.barHeight + 10)
                return `translate(${xTransform},${yTransform})`
              })
              .attr('d', geneSymbol)
              .attr('fill', (d) => {
                return vis.colorGenes
                  ? (vis.colorScale(String(d.homology_id)) as string)
                  : colors['gray-7']
              })
              .attr('stroke-width', (d) => '3px')
              .attr('stroke', (d) =>
                vis.colorGenes
                  ? (vis.colorScale(String(d.homology_id)) as string)
                  : colors['gray-7']
              ),
          //   vis.colorGenes
          //     ? vis.upstreamHomologies.includes(d.homology_id ?? 0)
          //       ? vis.colorScale(String(d.homology_id))
          //       : ''
          //     : ''
          // ),

          (exit) => exit.remove()
        )
    },

    //////////////////////////////////////////////////////////////////// Draw notifications //////////////////////////////////////
    drawNotifications() {
      let vis = this
      const genes = this.dataGenes
      if (genes === undefined) {
        const densityObjects = groupInfoDensity(genes)

        const dataDensity = {}
        Object.keys(densityObjects).forEach((key) => {
          dataDensity[key] = densityObjects[key].map(
            (item) => item.mRNA_start_position
          )
        })
        console.log('densityData', dataDensity)

        const thresholds = this.xScale.ticks(100) //to-do: make configurable?
        console.log('thresholds', thresholds)

        let allBins = []
        Object.keys(dataDensity).forEach((key) => {
          const bins = d3
            .bin()
            .domain(vis.xScale.domain())
            .thresholds(thresholds)(dataDensity[key])

          //first filter bins
          const binsFiltered = bins.filter((bin) => bin.length > 1)
          const binsFilteredwithSeq = binsFiltered.map((bin) => ({
            ...bin,
            sequence_id: key,
          }))

          allBins = allBins.concat(binsFilteredwithSeq)
        })
        console.log('allBins', allBins)

        this.svg()
          .selectAll('circle.density')
          .data(allBins, (d) => d.sequence_id)
          .join(
            (enter) =>
              enter
                .append('circle')
                .attr(
                  'transform',
                  `translate(${this.margin.left * 3},${
                    this.margin.top * 3 + vis.barHeight
                  })`
                )

                .attr('class', 'density')
                .attr(
                  'cx',
                  (d) =>
                    this.xScale(d.x0) +
                    (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
                )
                .attr('cy', (d, i) => {
                  return (
                    (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
                      1) *
                    (this.barHeight + 10)
                  )
                })
                .attr('r', 7),
            (update) =>
              update
                .transition()
                .duration(this.transitionTime)
                .attr(
                  'cx',
                  (d) =>
                    this.xScale(d.x0) +
                    (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
                )
                .attr('cy', (d, i) => {
                  return (
                    (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
                      1) *
                    (this.barHeight + 10)
                  )
                }),

            (exit) => exit.remove()
          )

        this.svg()
          .selectAll('text.density-value-focus')
          .data(allBins, (d) => d.sequence_id)
          .join(
            (enter) =>
              enter
                .append('text')

                .attr(
                  'transform',
                  `translate(${this.margin.left * 3},${
                    this.margin.top * 3 + this.barHeight
                  })`
                )
                .attr('class', 'density-value-focus')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'hanging')
                .attr(
                  'x',
                  (d) =>
                    this.xScale(d.x0) +
                    (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
                )
                .attr('dy', -4)
                .attr('y', (d, i) => {
                  return (
                    (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
                      1) *
                    (this.barHeight + 10)
                  )
                })
                .text(
                  (d) =>
                    Object.keys(d).filter(
                      (i) => i !== 'x0' && i !== 'x1' && i !== 'sequence_id'
                    ).length
                ),
            (update) =>
              update
                .transition()
                .duration(this.transitionTime)
                .attr(
                  'x',
                  (d) =>
                    this.xScale(d.x0) +
                    (this.xScale(d.x1) - this.xScale(d.x0) - 1) / 2
                )
                .attr('dy', -4)
                .attr('y', (d, i) => {
                  return (
                    (this.sequenceIdLookup[this.chromosomeNr][d.sequence_id] -
                      1) *
                    (this.barHeight + 10)
                  )
                }),

            (exit) => exit.remove()
          )
      }
    },
  },
  mounted() {
    console.log('sequence data from focusview', this.data)
    console.log('gene data from focusview', this.dataGenes)
    const contentElement = document.getElementById('content-focus')
    this.svgWidth =
      (contentElement?.offsetWidth || 0) * this.svgWidthScaleFactor

    if (this.chromosomeNr == 'unphased') {
      this.sortedChromosomeSequenceIndices[12].length * (this.barHeight + 10) +
        this.margin.top * 2
    } else {
      this.svgHeight = contentElement?.offsetHeight || 0
      // this.svgHeight = document.getElementById('content-focus').offsetHeight
    }

    // Anchor
    ////
    //1.find all cdf 1
    const homologyAnchor = this.dataGenes?.filter(
      (gene) => gene.homology_id === this.homologyFocus
    )

    let anchorLookup: Dictionary<number> = {}
    homologyAnchor?.forEach((item) => {
      const key = `${item.genome_number}_${item.sequence_number}`
      anchorLookup[key] = 0 //item.mRNA_start_position
    })
    this.anchorLookup = anchorLookup

    const divergentScale = this.dataGenes.map((item) => {
      const key = `${item.genome_number}_${item.sequence_number}`
      const anchorValue = anchorLookup[key]
      return item.mRNA_start_position - anchorValue
    })

    let anchorMin = d3.min(divergentScale)
    this.anchorMin = anchorMin ?? 0

    let anchorMax = d3.max(divergentScale)
    this.anchorMax = anchorMax ?? 0

    // Create individual scales
    ///
    let [newGenePositions, nodeGroups]: [GraphNode[], GraphNodeGroup[]] =
      runSpringSimulation(
        this.dataGenes ?? [],
        this.data ?? [],
        currentHeat.value,
        0.5,
        232273529
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

    this.data?.forEach((sequence) => {
      const key = sequence.sequence_id
      const genePositionsOnSequence = newGenePositions
        .filter((d) => String(d.sequenceId) === key)
        .sort((d) => d.originalPosition)

      const [geneToCompression, scaleGeneToWindow] = calculateIndividualScales(
        genePositionsOnSequence,
        edgesOfNewRangeGlobal,
        this.windowRange
      )
      xScaleGeneToCompressionInit[key] = geneToCompression
      xScaleGeneToWindowInit[key] = scaleGeneToWindow
    })
    //assign scale dictionaries
    geneToCompressionScales.value = xScaleGeneToCompressionInit

    this.drawXAxis() // draw axis once
    this.draw()

    // Add brushing
    var brush = d3
      .brushX() // Add the brush feature using the d3.brush function
      .extent([
        [this.windowRange[0] + this.margin.yAxis + this.margin.left * 3, 0],
        [
          this.windowRange[1] + this.margin.yAxis + this.margin.left * 3,
          this.visHeight,
        ],
      ])
      .on('end', this.updateChartBrushing)

    this.brush = brush

    var zoom = d3.zoom().on('zoom', this.updateZoom)
    d3.select(document.getElementById('content-focus')).call(zoom)
    // this.call(zoom)
    // Add brushing
    this.svg().append('g').attr('class', 'brush').call(brush)

    this.addClipPath()
    this.resetZoom()
    this.pan()

    this.observeWidth()

    var fisheyeO = {
      circular: () => {
        var radius = 200,
          distortion = 2,
          k0,
          k1,
          focus = [0, 0]

        function fisheye(d) {
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

        fisheye.radius = function (_) {
          if (!arguments.length) return radius
          radius = +_
          return rescale()
        }

        fisheye.distortion = function (_) {
          if (!arguments.length) return distortion
          distortion = +_
          return rescale()
        }

        fisheye.focus = function (_) {
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
    // Watch for updates to `filteredSequences`
    filteredSequences: {
      handler(newVal) {
        console.log('Filtered sequences updated:', newVal)
        this.addLabels()
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

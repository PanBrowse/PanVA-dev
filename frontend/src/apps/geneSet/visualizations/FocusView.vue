<!-- <template>
  <ACard
    title="Focus View"
    :style="{
      width: `${100}%`,
      height: `${100}%`,
    }"
    :bordered="false"
    size="small"
    v-if="!rerunSimulation"
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
  <LoadingScreen v-else>Loading data, please wait...</LoadingScreen>
</template> -->

<script lang="ts">
import { CloseCircleOutlined, ConsoleSqlOutlined } from '@ant-design/icons-vue'
import { Button, Card } from 'ant-design-vue'
import * as d3 from 'd3'
import { type Dictionary } from 'lodash'
import { mapActions, mapState } from 'pinia'
import { computed, defineComponent, ref, watch } from 'vue'

import LoadingScreen from '@/components/LoadingScreen.vue'

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
import { type GraphNode, type GraphNodeGroup } from '@/helpers/springSimulationUtils'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGenomeStore } from '@/stores/geneSet'
import type { Gene, GroupInfo, Locus, Sequence, SequenceInfo, SequenceMetrics } from '@/types'
import { drawSquish } from './compressibleScale';
import { arrayRange } from '@/helpers/arrayRange';


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
// const isLoading = ref<boolean>(true)

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
    LoadingScreen
  },
  setup() {
    const genomeStore = useGenomeStore()
    const filteredSequences = ref<SequenceInfo[]>([])
    const filteredGenes = ref<Gene[]>([])
    const indexMap = ref<Map<number, number>>(new Map())
    const mappedIndices = ref<number[]>([])
    const sequenceIndicesInLookup = ref<number[]>([])
    const filteredSegments = ref<(Locus)[]>([])
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

          // Update filteredGenes based on the filtered sequences
          filteredGenes.value = genomeStore.genomeData.genes.filter((gene) =>
            newSelection.includes(gene.sequence_uid ?? '')
          )

          
          console.log('Filtered sequences:', filteredSequences.value)
          console.log('Filtered genes:', filteredGenes.value)
        } else {
          // Reset or handle the case where no sequence is selected
          filteredSequences.value = []
          filteredGenes.value = []
          filteredSegments.value = []
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

        filteredSegments.value = filteredSequences.value.flatMap(sequence => {
            const genes = filteredGenes.value.filter(d => d.sequence_uid === sequence.uid)
            genes.sort((a,b) => a.start - b.start)
            if(genes.length === 0) {
              return [{
              uid: sequence.uid ?? 0,
              loci_length_nuc: length,
              genes: [],
              name: String(0),
              start: 0,
              end: sequence.sequence_length_nuc
              } as Locus]
            }

            const segments = 
            genes.map((gene, i) => {
              let segmentEndPosition
              if(i === genes.length - 1) { 
                segmentEndPosition = sequence.sequence_length_nuc 
              }
              else {
                const nextGene = genes[i+1]
                segmentEndPosition = nextGene.start
              }
              const segmentStartPosition = gene.end
              const length = segmentEndPosition - segmentStartPosition

              return {
              uid: gene.sequence_uid ?? 0,
              loci_length_nuc: length,
              genes: [],
              name: String(i),
              start: segmentStartPosition,
              end: segmentEndPosition
              } as Locus
            })

            const firstSegment: Locus = {
              uid: sequence.uid ?? 0,
              loci_length_nuc: genes[0].start,
              genes: [],
              name: String(0),
              start: 0,
              end: genes[0].start
              } 

              return [firstSegment, ...segments]
          })

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
      filteredSegments
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
    barHeight: 10,
    sortedSequenceIds: [],
    idleTimeout: { type: [null, Number] },
    defaultConnectionThickness: 3,
    maxNTranscripts: 5,
    transcriptSpacing: 2,
    transcriptHeight: 2,
    transcriptWidth: 2,
    isLoading: true
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
      'rerunSimulation',
      'scaleXForce',
      'scaleYForce',
      'scaleContraction',
      'scaleRepulsion',
      'minimumDistance'
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
      return [
        this.margin.yAxis + this.margin.left,
        this.visWidth - this.margin.yAxis - this.margin.left,
      ]
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

    async runSimulation() {
      const response = await this.simulationAsync()
      let [newGenePositions, nodeGroups]: [GraphNode[], GraphNodeGroup[]] = response
      useGeneSetStore().rerunSimulation = false

      crossingHomologyGroups.value = crossDetection(newGenePositions)

      let xScaleGeneToWindowInit: Dictionary<
        d3.ScaleLinear<number, number, never>
      > = {}
      let xScaleGeneToCompressionInit: Dictionary<
        d3.ScaleLinear<number, number, never>
      > = {}
      //determine global ranges'
      const sortedCompressionRangeGlobal = newGenePositions
        .map((d) => d.startPosition)
        .sort((a, b) => a - b)

      const edgesOfNewRangeGlobal: [number, number] = [
        sortedCompressionRangeGlobal[0],
        sortedCompressionRangeGlobal[sortedCompressionRangeGlobal.length - 1],
      ]

      const oldRanges = newGenePositions
      .map((d) => d.originalPosition)
      .sort((a, b) => a - b)
      const edgesOfOldRange = [oldRanges[0], oldRanges[oldRanges.length - 1]]

      compressionViewWindowRange.value = edgesOfNewRangeGlobal
      const compressions: number[] = []

      useGenomeStore().genomeData.sequences.forEach((sequence) => {
        //find gene positions
        const key = sequence.uid
        let genePositionsOnSequence = newGenePositions
          .filter((d) => String(d.sequenceId) === key)
          .sort((d) => d.originalPosition)

          // create scales
        const [geneToCompression, scaleGeneToWindow] = calculateIndividualScales(
          genePositionsOnSequence,
          edgesOfNewRangeGlobal,
        )
        xScaleGeneToCompressionInit[key] = geneToCompression
        xScaleGeneToWindowInit[key] = scaleGeneToWindow

        //  calculate compression
        if(genePositionsOnSequence.length === 0) { return }
        const compressedWidth = geneToCompression(sequence.sequence_length_nuc) - geneToCompression(0)
        const compression = sequence.sequence_length_nuc / compressedWidth
        compressions.push(compression)
      })
      //assign scale dictionaries
      geneToCompressionScales.value = xScaleGeneToCompressionInit
      // find median compression
      compressions.sort((a,b)  => a - b)

      const medianCompression = compressions[Math.floor(compressions.length / 2)]
      globalCompressionFactor.value = medianCompression
      this.isLoading = false
    },

    async simulationAsync() {
      this.isLoading = true
      const response = new Promise<[GraphNode[], GraphNodeGroup[]]>((resolve) => resolve(runSpringSimulation(
        useGenomeStore().genomeData.genes ?? [],
        useGenomeStore().genomeData.sequences ?? [],
        currentHeat.value,
        1,
        {scaleXForce: useGeneSetStore().scaleXForce,
        scaleYForce: useGeneSetStore().scaleYForce,
        scaleContraction: useGeneSetStore().scaleContraction,
        scaleRepulsion: useGeneSetStore().scaleRepulsion,
        minimumDistance: useGeneSetStore().minimumDistance,
        },
        736740)))
      return response
    },

    ///////////////////////////////////////////////////////////////////////////////Update chart////////////////////////////////////
    updateChartBrushing({
      selection,
    }: {
      selection: [number, number]
    }): NodeJS.Timeout | undefined {
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
        (selection[1] - this.margin.yAxis - this.margin.left) / rangeWidth,
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
        .duration(this.transitionTime)
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
            .duration(vis.transitionTime)
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
            .duration(vis.transitionTime)
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
          this.margin.yAxis -
          this.margin.left) /
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
        .duration(this.transitionTime)
        // .call(d3.axisTop(this.xScale))
        .call((g) => g.select('.domain').remove())
        .call((g) => g.selectAll('line').attr('stroke', '#c0c0c0'))
        .call((g) => g.selectAll('text').attr('fill', '#c0c0c0'))

      this.svg().selectAll('circle.density').remove()
      this.svg().selectAll('text.density-value-focus').remove()
      this.draw()
    },
    ///////////////////////////////////////////////////////////////////////////////Draw bars ////////////////////////////////////
    drawSquishBars() {
      let vis = this
      if (this.filteredSegments === undefined) {
        return
      }

      this.svg()
        .select('g.bar-context')
        .selectAll('path.bar-chr-context')
        .data(vis.filteredSegments, d => d.uid + d.start)
        .join(
          (enter) =>
            enter
              .append('path')
              .attr('class', 'bar-chr-context')
              .attr('d', (d) => {
                const key: string = d.uid ?? ''
                const xPos = d.start
                const geneIndex = vis.indexMap.get(this.genomeStore.sequenceUidLookup[key]) ?? 0
                const ypos = geneIndex  * (this.barHeight + 10)

                const currentGeneToWindowScale = this.geneToWindowScales[key]
                if(currentGeneToWindowScale === undefined || currentGeneToWindowScale === null) {
                  return ''
                }
                const currentGeneToCompressionScale = geneToCompressionScales.value[key]

                return drawSquish(
                  currentGeneToCompressionScale,
                  currentGeneToWindowScale,
                  xPos,
                  d.end,
                  this.barHeight,
                  ypos,
                  this.defaultConnectionThickness,
                  globalCompressionFactor.value
                )
              })
              .attr('fill', (d) => {
                if (vis.colorGenomes == true) {
                  return vis.colorScaleGenome(String(d.uid)) as string
                }
                return 'lightgray'
              })
              .attr('opacity', () => {
                if (vis.colorGenomes == true) {
                  return 0.5
                }
                return 1
              })
              .attr('z-index', 100)
              .attr('clip-path', 'url(#clipDetails)'),
          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('transform', d => {
                const key: string = d.uid ?? ''
                const index = vis.indexMap.get(this.genomeStore.sequenceUidLookup[key]) ?? 0
                const ypos = index * (this.barHeight + 10)
                return `translate(0,${ypos})`
              })
              .attr('d', (d) => {
                const key: string = d.uid ?? ''
                const xPos = d.start
                const yPos = 0

                const currentGeneToWindowScale = this.geneToWindowScales[key]
                const currentGeneToCompressionScale =
                  geneToCompressionScales.value[key]

                return drawSquish(
                  currentGeneToCompressionScale,
                  currentGeneToWindowScale,
                  xPos,
                  d.end,
                  this.barHeight,
                  yPos,
                  this.defaultConnectionThickness,
                  globalCompressionFactor.value
                )
              })
              .attr('fill', (d) => {
                if (vis.colorGenomes == true) {
                  return vis.colorScaleGenome(String(d.uid)) as string
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
                  this.genomeStore.sequenceUidLookup[d.uid] *
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
          'translate(' +
            this.margin.left +
            this.margin.yAxis +
            ',' +
            this.margin.top * 2 +
            ')'
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

        let connectionsLine = (sortedPath: Gene[]) => {
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
          if (currentGeneToWindow === undefined) {
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
        .select('g.gene-context')
        .selectAll('path.gene')
        .data(vis.filteredGenes, d => d.uid)
        .join(
          (enter) =>
            enter
              .append('path')
              .attr('d', geneSymbol)
              .attr('transform', function (d, i) {
                const sequence = d.sequence_uid
                let xTransform = vis.geneToWindowScales[sequence ?? ''](
                  d.start + (d.end - d.start) / 2
                )
                let drawingIndex =
                  vis.indexMap.get(
                    vis.genomeStore.sequenceUidLookup[sequence ?? '']
                  ) ?? 0
                let yTransform =
                  drawingIndex * (vis.barHeight + 10) + vis.barHeight / 2
                let rotation = d.strand === 0 ? 0 : 180
                return `translate(${xTransform},${yTransform}) rotate(${rotation})`
              })
              .attr('class', 'gene')
              .attr(
                'hg',
                (d: Gene) => d.homology_groups?.map((entry) => entry.id) ?? []
              )
              .attr('stroke-width', '3px')
              .attr('fill', colors['gray-7'])
              .attr('z-index', 1000)
              .attr('opacity', 0.8),
          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('transform', (d) => {
                const key = d.sequence_uid ?? '' //vis.geneToLocusSequenceLookup.get(d.uid)?.sequence
                const scale = this.geneToWindowScales[key]
                let xTransform = this.geneToWindowScales[key](
                  d.start 
                ) + (scale(d.end) - scale(d.start) ) /2
                let drawingIndex =
                  vis.indexMap.get(vis.genomeStore.sequenceUidLookup[key]) ?? 0
                let yTransform =
                  drawingIndex * (vis.barHeight + 10) + this.barHeight / 2
                let rotation = d.strand === 0 ? 0 : 180
                return `translate(${xTransform},${yTransform}) rotate(${rotation})`
              })
              .attr('d', geneSymbol)
              .attr('z-index', 1000)
              .attr('fill', (d) => {
                return vis.colorGenes
                  ? (vis.colorScale(String(d.homology_groups[0].uid)) as string)
                  : 'gray'
              }),
          // .attr('fill', colors['gray-7']),
          (exit) => exit.remove()
        )

        // draw transcripts///////////////////////////////////////////
        this.svg()
        .select('g.gene-context')
        .selectAll('path.mrna')
        .data(vis.filteredGenes, (d:Gene) => d.uid + d.sequence)
        .join(
          (enter) =>
            enter.append('path')
              .attr('d', d => {
                const nTranscripts = d.mrnas.length
                if(nTranscripts < 2) {return ''}
                const key = d.sequence_uid ?? ''
                const size = getGeneSymbolSize(d, this.geneToWindowScales[key], this.barHeight, true)
                if(size <= this.barHeight * 4) {return ''}
                const renderedNTranscripts = Math.min(nTranscripts, this.maxNTranscripts)
                const transcriptsWidth = 
                  (this.transcriptWidth + this.transcriptSpacing) * 
                  renderedNTranscripts

                let line = ''
                arrayRange(0, renderedNTranscripts - 1).forEach((element, i) => {
                  const x = i * (this.transcriptWidth + this.transcriptSpacing) - 
                  transcriptsWidth / 2
                  const yTop = this.barHeight / 2 + 1
                  const localLine = d3.line()([
                  [x, yTop],
                  [x, yTop + this.transcriptHeight]])
                  line = line + localLine
                });
                return line
              })
              .attr('transform', (d) => {
                const key = d.sequence_uid ?? '' //vis.geneToLocusSequenceLookup.get(d.uid)?.sequence
                let xTransform = this.geneToWindowScales[key](
                  d.start + (d.end-d.start)/2
                )
                let drawingIndex =
                  vis.indexMap.get(vis.genomeStore.sequenceUidLookup[key]) ?? 0
                let yTransform =
                  drawingIndex * (vis.barHeight + 10) + this.barHeight / 2 +5
                let rotation = d.strand === 0 ? 0 : 180
                return `translate(${xTransform},${yTransform}) rotate(${rotation})`
              })
              .attr('stroke', (d) => {
                return vis.colorGenes
                  ? (vis.colorScale(String(d.homology_groups[0].uid)) as string)
                  : 'gray'
              })
              .attr('class', 'mrna')
              .attr('opacity', 1)
              .style('stroke-width', this.transcriptWidth),
          (update) => 
            update
              .transition()
              .duration(this.transitionTime)
              .attr('d', d => {
                const nTranscripts = d.mrnas.length
                if(nTranscripts < 2) {return ''}

                const key = d.sequence_uid ?? ''
                const size = getGeneSymbolSize(d, this.geneToWindowScales[key], this.barHeight, true)
                if(size <= this.barHeight *4) {return ''}

                const renderedNTranscripts = Math.min(nTranscripts, this.maxNTranscripts)
                
                // draw ticks for each transcript
                let line = ''
                const transcriptsWidth = 
                  (this.transcriptWidth + this.transcriptSpacing) * 
                  renderedNTranscripts
                arrayRange(0, renderedNTranscripts-1).forEach((element, i) => {
                  const x = i * (this.transcriptWidth 
                    + this.transcriptSpacing) 
                    - transcriptsWidth / 2
                  const yTop = this.barHeight / 2 + 1
                  const localLine = d3.line()([
                  [x, yTop],
                  [x, yTop + this.transcriptHeight]])
                  line = line + localLine
                });
                return line
              })
              .attr('transform', (d) => {
                const key = d.sequence_uid ?? '' //vis.geneToLocusSequenceLookup.get(d.uid)?.sequence
                let xTransform = this.geneToWindowScales[key](
                  d.start + (d.end-d.start)/2
                ) 
                let rowNumber =
                  vis.indexMap.get(vis.genomeStore.sequenceUidLookup[key]) ?? 0
                let yTransform =
                  rowNumber * (vis.barHeight + 10) + this.barHeight / 2

                return `translate(${xTransform},${yTransform})`
              })
              .attr('stroke', (d) => {
                return vis.colorGenes
                  ? (vis.colorScale(String(d.homology_groups[0].uid)) as string)
                  : 'gray'
              })
              .attr('opacity', 1)
              .style('stroke-width', this.transcriptWidth),
              (exit) => exit.remove()
        )
      }
  },
  mounted() {
    const contentElement = document.getElementById('content-focus')
    this.svgWidth =
      (contentElement?.offsetWidth || 0) * this.svgWidthScaleFactor

    this.svgHeight = contentElement?.clientHeight ?? 1000


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

    let [newGenePositions, nodeGroups]: [GraphNode[], GraphNodeGroup[]] =
      runSpringSimulation(
        this.genomeStore.genomeData.genes ?? [],
        this.genomeStore.genomeData.sequences ?? [],
        currentHeat.value,
        1,
        {scaleXForce: useGeneSetStore().scaleXForce,
        scaleYForce: useGeneSetStore().scaleYForce,
        scaleContraction: useGeneSetStore().scaleContraction,
        scaleRepulsion: useGeneSetStore().scaleRepulsion,
        minimumDistance: useGeneSetStore().minimumDistance,
        },
        736740
      )
    this.isLoading = false

    // let newGenePositions = genesToNodes(this.filteredGenes)
    //used for alignment
    const anchorPoints = [newGenePositions[2], newGenePositions[3]]

    crossingHomologyGroups.value = crossDetection(newGenePositions)

    let xScaleGeneToWindowInit: Dictionary<
      d3.ScaleLinear<number, number, never>
    > = {}
    let xScaleGeneToCompressionInit: Dictionary<
      d3.ScaleLinear<number, number, never>
    > = {}
    //determine global ranges'
    const sortedCompressionRangeGlobal = newGenePositions
      .map((d) => d.startPosition)
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
    const compressions: number[] = []    
    this.genomeStore.genomeData.sequences.forEach((sequence) => {
      //find gene positions
      const key = sequence.uid
      let genePositionsOnSequence = newGenePositions
        .filter((d) => String(d.sequenceId) === key)
        .sort((d) => d.originalPosition)

        // create scales
      const [geneToCompression, scaleGeneToWindow] = calculateIndividualScales(
        genePositionsOnSequence,
        edgesOfNewRangeGlobal,
        this.windowRange
      )
      xScaleGeneToCompressionInit[key] = geneToCompression
      xScaleGeneToWindowInit[key] = scaleGeneToWindow

      //  calculate compression
      if(genePositionsOnSequence.length === 0) { return }
      const compressedWidth = geneToCompression(sequence.sequence_length_nuc) - geneToCompression(0)
      const compression = sequence.sequence_length_nuc / compressedWidth
      compressions.push(compression)
    })
    //assign scale dictionaries
    geneToCompressionScales.value = xScaleGeneToCompressionInit
    // find median compression
    compressions.sort((a,b)  => a - b)

    const medianCompression = compressions[Math.floor(compressions.length / 2)]
    globalCompressionFactor.value = medianCompression

    this.drawXAxis() // draw axis once
    this.draw()

    // Add brushing
    var newBrush = d3
      .brushX() // Add the brush feature using the d3.brush function
      .extent([
        [this.windowRange[0], 0],
        [this.windowRange[1], this.visHeight],
      ])
      .on('end', this.updateChartBrushing)

    brush.value = newBrush

    var zoom = d3.zoom().on('zoom', this.updateZoom)
    const selection = d3.select(document.getElementById('content-focus'))
    selection.call(zoom)
    // this.call(zoom)
    // Add brushing
    this.svg().append('g').attr('class', 'brush').call(brush.value)

    // create groups for focus view drawing
    this.svg().append('g').attr('class', 'bar-context')
      .attr('transform', `translate(${0} ,${this.margin.top * 2})`)
    this.svg().append('g').attr('class', 'gene-context')
    .attr('transform', `translate(${0} ,${this.margin.top * 2})`)

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

        function fisheye(d: { x: number; y: number }) {
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
  actions: {

  },
  watch: {
    //Watch for updates to `mappedIndices` before redrawing
    filteredGenes: {
      handler(newVal) {
        console.log('filteredGenes updated:', newVal)
        this.drawSquishBars()
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    mappedIndices: {
      handler(newVal) {
        console.log('mappedIndices updated:', newVal)
        this.addLabels()
        this.drawSquishBars()
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    indexMap: {
      handler(newVal) {
        console.log('indexMap updated:', newVal)
        this.addLabels()
        this.drawSquishBars()
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    sequenceIndicesInLookup: {
      handler(newVal) {
        console.log('sequenceIndicesInLookup updated:', newVal)
        this.addLabels()
        this.drawSquishBars()
        this.drawGenes()
      },
      deep: true,
      immediate: true,
    },
    colorGenes() {
      this.drawGenes()
    },
    showLinks() {
      this.drawSquishBars()
      this.drawGenes()
    },
    anchor() {
      this.svg().select('g.x-axis').remove()
      this.drawXAxis() // redraw
      this.drawSquishBars()
      this.drawGenes()
    },
    showNotificationsDetail() {
      this.draw()
    },
    colorGenomes() {
      console.log('color genomes')
      this.drawSquishBars()
      this.drawGenes()
    },
    // percentageGC() {
    //   console.log('show GC')
    //   this.drawContextBars()
    // },
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
    geneToWindowScales: { 
      handler(newVal) {
        this.draw()
      },
      immediate: true,
      deep: true
    },
    rerunSimulation: {
      async handler(rerun) {
        if(!rerun ) {
          return
        }
        this.isLoading = true
        await this.runSimulation()
      }
    }
  }
}
</script>

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
    <!-- <LoadingScreen>Loading data, please wait...</LoadingScreen> -->
    <LoadingScreen v-show="rerunSimulation">Loading data, please wait...</LoadingScreen>
    <svg
      :id="`container_${name}`"
      :width="containerWidth"
      :height="svgHeight"
    ></svg>
  </ACard>

</template>

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

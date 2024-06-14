<template>
  <ACard
    :title="`${cardName}`"
    :style="{
      width: `${100}%`,
      height: `${100}%`,
    }"
    :bordered="false"
    size="small"
  >
    <template #extra
      ><AButton type="text" size="small" @click="deleteChromosome(`${name}`)"
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
// import * as d3Fisheye from 'd3-fisheye'
// import * as d3Fisheye from 'd3-fisheye'
import { divide, floor, includes, indexOf, round, type Dictionary } from 'lodash'
import { mapActions, mapState } from 'pinia'

import { groupInfoDensity } from '@/helpers/chromosome'
import { asterisk, cross, plus } from '@/helpers/customSymbols'
// import * as fisheye from '@/helpers/fisheye'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGlobalStore } from '@/stores/global'
import type { GroupInfo, SequenceMetrics } from '@/types'

export default {
  name: 'SequencesDetails',
  props: {
    chromosomeNr:{type: String, required: true},
    name: String,
    data: Array<SequenceMetrics>,
    dataGenes: {type: Array<GroupInfo>}  ,
    dataMin: { type: Number, required: true },
    dataMax: { type: Number, required: true },
    nrColumns: Number,
    maxGC: {type: Number, required: true},
    minGC: {type: Number, required: true},
  },
  components: {
    ACard: Card,
    AButton: Button,
    CloseCircleOutlined: CloseCircleOutlined,
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
    transitionTime: 750,
    numberOfCols: 2,
    barHeight: 6,
    sortedSequenceIds: [],
    idleTimeout: {type: [null, Number]},
    // anchorMin: 0,
    // anchorMax: 0,
    // brush: null,
    // xScale: undefined,
    // ticksXdomain: []
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
      'colorGenes',
      'showLinks',
    ]),
    cardName() {
      if(this.name === undefined) {return "Undefined"}
      return this.name.split('_')[0]
    },
    containerWidth() {
      return this.showTable ? this.svgWidth / 2 : this.svgWidth
    },
    visWidth() {
      return this.containerWidth - 12 - 12 - 10 - 17.5
    },
    visHeight() {
      return this.svgHeight
    },

    xScale() {
      return this.anchor
        ? d3
            .scaleLinear()
            // .domain([this.dataMin > 0 ? 0 : this.dataMin, this.dataMax])
            .domain([-this.anchorMax, this.anchorMax])
            .nice()
            .rangeRound([
              0,
              this.visWidth - this.margin.yAxis + this.margin.left * 4,
            ])
        : d3
            .scaleLinear()
            .domain([this.dataMin > 0 ? 0 : this.dataMin, this.dataMax])
            
            // .domain([-this.anchorMax, this.anchorMax])
            .nice()
            .rangeRound([
              0,
              this.visWidth - this.margin.yAxis + this.margin.left * 4,
            ])
    },
 
    //   return ticks
    // },
    colorScale():  d3.ScaleOrdinal<string, unknown, never> {
      return d3
        .scaleOrdinal()
        .domain(this.homologyGroups.map(toString))
        .range(d3.schemeCategory10)
    },
    colorScaleGC() {
      return d3
        .scaleSequential()
        .domain([this.minGC ?? 0, this.maxGC ?? 1 ])
        .interpolator(d3.interpolateGreys)
    },
    colorScaleGenome(): d3.ScaleOrdinal<string, unknown, never> {
      return d3.scaleOrdinal().domain(['1','2','3','4','5']).range(d3.schemeCategory10)
      // .interpolator(d3.interpolateViridis)
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
  },
  methods: {
    ...mapActions(useGeneSetStore, ['deleteChromosome']),
    observeWidth() {
      const htmlElement:HTMLElement | null = document.getElementById('content')
      if (htmlElement === null) {return}
      let vis = this
      const resizeObserver = new ResizeObserver(function () {
        vis.svgWidth =
          htmlElement.offsetWidth *
          vis.svgWidthScaleFactor
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

    
    updateDomain(inputScale: d3.ScaleLinear<number, any, any>, newLocalRangeBounds: [number, number], referenceScale: d3.ScaleLinear<number, any, any>, assignedWindowRange?:[number, number]) {
      if(newLocalRangeBounds[0] === newLocalRangeBounds[1]) {return inputScale}
      const newRelariveRangeBoundsSorted = newLocalRangeBounds.sort((a,b) => a-b)
      const referenceRange: number[] = referenceScale.range().sort((a,b) => a-b)
      const windowRange = assignedWindowRange ?? [referenceRange[0], referenceRange[referenceRange.length-1]]
      const oldDomain = [inputScale.domain()[0], inputScale.domain()[inputScale.domain().length -1]]
      const referenceDomain = referenceScale.domain()

      const oldRangeGlobal = [
        referenceScale(oldDomain[0]),
        referenceScale(oldDomain[1])  
      ]

      // calculate new range bounds in global coordinates
      const percentageLeft = newRelariveRangeBoundsSorted[0]/(windowRange[1] - windowRange[0])
      const percentageRight = (newRelariveRangeBoundsSorted[1] - windowRange[1])/(windowRange[1] - windowRange[0])
      const oldRangeLengthGlobal = oldRangeGlobal[1] - oldRangeGlobal[0] 
      const newRangeGlobal = [
        oldRangeGlobal[0] + percentageLeft * oldRangeLengthGlobal,
        oldRangeGlobal[1] + percentageRight * oldRangeLengthGlobal 
      ]

      // find points in the new view range
      const newWindowFirstGeneIndex: number = referenceRange.findIndex(d => d > newRangeGlobal[0])
      const newWindowLastGeneIndex: number = referenceRange.findIndex(d => d > newRangeGlobal[1]) 
      const newRangeInViewGlobal = referenceRange.slice(newWindowFirstGeneIndex, newWindowLastGeneIndex)
      const genesInView = referenceDomain.slice(newWindowFirstGeneIndex, newWindowLastGeneIndex)

      // Calculate newRange and newDomain
      const globalToLocal = d3.scaleLinear().domain(newRangeGlobal).range(windowRange)
      const newRangeInViewLocal = newRangeInViewGlobal.map(d => globalToLocal(d))
      const newRange: number[] = [windowRange[0], ...newRangeInViewLocal, windowRange[1]]
      const newDomain = [referenceScale.invert(newRangeGlobal[0]), ...genesInView, referenceScale.invert(newRangeGlobal[1])]

      return inputScale.domain(newDomain).range(newRange)
    },

    ///////////////////////////////////////////////////////////////////////////////Update chart////////////////////////////////////
    updateChart({ selection }): NodeJS.Timeout | undefined {
      console.log('brush selection', selection)

      // If no selection, back to initial coordinate. Otherwise, update X axis domain
      if (!selection) {return} 
      console.log(
        'range',

        this.xScale.invert(selection[0] - (this.margin.left *3)),
        this.xScale.invert(selection[1] - (this.margin.left *3)),

      )

      this.xScale.domain([
        this.xScale.invert(selection[0] - (this.margin.left *3)),
        this.xScale.invert(selection[1] - (this.margin.left *3)),
      ])

      // Update individual scales
      for (const [key, value] of Object.entries(this.xScaleLookup)) {
        const currentScale = value as d3.ScaleLinear<number, any, any>
        // const newDomain: [number, number] = [
        //   currentScale.invert(selection[0] - (this.margin.left *3)),
        //   currentScale.invert(selection[1] - (this.margin.left *3))
        // ]
        const newRange: [number, number] = [
        selection[0] ,
        selection[1] ,
      ]
        this.xScaleLookup[key] = this.updateDomain(currentScale, newRange, this.xScaleBasic[key])
      }

      this.svg().select('.brush').call(this.brush.move, null) // This remove the grey brush area as soon as the selection has been done
      this.svg()
        .select('.x-axis')
        .transition()
        .duration(1000)
        .call(
          d3.axisTop(this.xScale)
        )
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
        if (event.key === 'ArrowLeft') {
          const prevDomain = vis.xScale.domain()
          console.log('previous domain', prevDomain)
          const rangeDomain = 100000
          console.log('range domain', rangeDomain)

          // console.log('anchor?', vis.anchor)

          let newDomain

          if (vis.anchor) {
            newDomain = [
              prevDomain[0] - rangeDomain,
              prevDomain[1] - rangeDomain,
            ]
          } else {
            newDomain = [
              prevDomain[0] - rangeDomain < 0 ? 0 : prevDomain[0] - rangeDomain,
              prevDomain[1] - rangeDomain,
            ]
          }

          // Update individual scales
          for (const [key, value] of Object.entries(this.xScaleLookup)) {
            const currentScale = value as d3.ScaleLinear<number, any, any>
            const prevDomain = currentScale.domain()
            const rangeDomain = floor((prevDomain[prevDomain.length-1] - prevDomain[0] )/2)
            
            let newDomain
            if (vis.anchor) {
              newDomain = [
                prevDomain[0] - rangeDomain,
                prevDomain[prevDomain.length-1] - rangeDomain,
              ]
            } else {
              newDomain = [
                prevDomain[0] - rangeDomain < 0 ? 0 : prevDomain[0] - rangeDomain,
                prevDomain[prevDomain.length-1] - rangeDomain,
              ]
            }

            this.xScaleLookup[key] = currentScale.domain([vis.dataMin < 0 ? 0 : newDomain[0], newDomain[1]]).nice()
          }

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
        }
        if (event.key === 'ArrowRight') {
          const prevDomain = vis.xScale.domain()
          console.log('previous domain', prevDomain)
          const rangeDomain = 100000
          console.log('range domain', rangeDomain)

          const newDomain = [
            prevDomain[0] + rangeDomain,
            prevDomain[1] + rangeDomain > vis.dataMax
              ? vis.dataMax
              : prevDomain[1] + rangeDomain,
          ]
            // Update individual scales
          for (const [key, value] of Object.entries(this.xScaleLookup)) {
            const currentScale = value as d3.ScaleLinear<number, any, any>
            const prevDomain = currentScale.domain()
            const rangeDomain = floor((prevDomain[1] - prevDomain[0] )/2)

            const newDomain = [
              prevDomain[0] + rangeDomain,
              prevDomain[1] + rangeDomain > vis.dataMax
                ? vis.dataMax
                : prevDomain[1] + rangeDomain,
            ]

            this.xScaleLookup[key] = currentScale.domain([vis.dataMin < 0 ? 0 : newDomain[0], newDomain[1]]).nice()
          }

          console.log('new domain', newDomain, vis.xScale.domain())

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
        }
      })
    },
    idled() {
      this.idleTimeout = null
    },
    
    ///////////////////////////////////////////////////////////////////////////////update zoom ////////////////////////////////////
    updateZoom( zoomEvent) {
      // console.log('zoom event', zoomEvent)

      // If no zoom, back to initial coordinate. Otherwise, update X axis domain
      if (!zoomEvent) { return; }
      if (zoomEvent.sourceEvent.type !== 'wheel') { return; }

      // calculate new bounds for the range
      const xPosition = zoomEvent.sourceEvent.pageX
      const percentage = (xPosition - this.xScale.range()[0] - (3* this.margin.left))/(this.xScale.range()[this.xScale.domain().length -1] -  this.xScale.range()[0] - (3* this.margin.left) )
      const currentRangeBounds: [number, number] = [this.xScale.range()[0] , this.xScale.range()[this.xScale.range().length - 1 ]]
      const rangeWidth = Math.abs((this.xScale.range()[this.xScale.range().length -1] -  this.xScale.range()[0]))
      const newRangeBounds = [
        currentRangeBounds[0] - (zoomEvent.sourceEvent.wheelDelta * rangeWidth  * 0.001 * percentage),
        currentRangeBounds[1] + (zoomEvent.sourceEvent.wheelDelta * rangeWidth * 0.001 * (1-percentage)) 
      ]

      this.xScale.domain([this.xScale.invert(newRangeBounds[0]), this.xScale.invert(newRangeBounds[1])])

            // Update individual scales
      for (const [key, value] of Object.entries(this.xScaleLookup)) {
        const currentScale = value as d3.ScaleLinear<number, any, any>

        this.xScaleLookup[key] = this.updateDomain(
          currentScale, newRangeBounds as [number, number],
          this.xScaleBasic[key],
          currentRangeBounds
        )
      }

      this.svg()
        .select('.x-axis')
        .transition()
        .duration(300)
        .call(
          d3.axisTop(this.xScale)

        )
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

      // console.log('data sequence details', this.data)
      this.svg()
        .selectAll('rect.bar-chr')
        .data(this.data, (d:any) => d.sequence_id)
        .join(
          (enter) =>
            enter
              .append('rect')
              .attr(
                'transform',
                `translate(${this.margin.left * 3},${this.margin.top * 2})`
              )
              .attr('class', 'bar-chr')
              // .attr('x', this.xScale(0))
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
              .attr('height', this.barHeight)

              .attr('fill',  (d) => {
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
              .attr('clip-path', 'url(#clipDetails)'),
          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('x', this.anchor ? this.xScale(-35000000) : this.xScale(0))
              .attr('fill',  (d)  => {
                let color:any
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
              // .attr('width', function (d) {
              //   return vis.xScale(d.sequence_length)
              // }),
              .attr('width', (d) =>
                this.anchor
                  ? this.xScale(70000000)
                  : vis.xScale(d.sequence_length)
              ),

          (exit) => exit.remove()
        )
    },
    ///////////////////////////////////////////////////////////////////////////////Draw context bars ////////////////////////////////////
    drawContextBars() {
      let vis = this
      
      if( this.data === undefined) {return}

      this.svg()
        .selectAll('rect.bar-chr-context')
        .data(this.data, (d:any) => d.sequence_id)
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
    

    // Drawing specification starts here ///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////Draw ////////////////////////////////////
    draw() {
      if (this.chromosomeNr !== 'unphased') {
        this.drawBars()
        this.drawContextBars()
        this.addLabels()
        this.drawGenes()

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
      if( this.data === undefined) {return}
      this.svg()
        .selectAll('text.label-chr')
        .data(this.data, (d:any) => d.sequence_id)
        .join(
          (enter) =>
            enter
              .append('text')
              .attr('transform', `translate(20,${this.margin.top * 2})`)
              .attr('class', 'label-chr')
              .attr('dominant-baseline', 'hanging')
              .attr('text-anchor', 'end')
              .attr('x', 5)
              .attr('font-size', 10)
              .attr(
                'y',
                (d, i) =>
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr][i] *
                  (this.barHeight + 10)
              )

              .attr('dy', this.barHeight / 3)
              // .text((d) => d.sequence_id.split('_')),
              .text((d) =>
                d.phasing_id.includes('unphased')
                  ? d.genome_number + '_' + 'U'
                  : d.genome_number + '_' + d.phasing_id.split('_')[1]
              ),

          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('y', function (d, i) {
                return (
                  vis.sortedChromosomeSequenceIndices[vis.chromosomeNr][i] *
                  (vis.barHeight + 10)
                )
              }),
          (exit) => exit.remove()
        )

    },
    /////////////////////////////////////////////////////////////////////////////// Add values ////////////////////////////////////
    addValues() {
      if( this.data === undefined) {return}
      this.svg()
        .selectAll('text.value-chr')
        .data(this.data, (d:any) => d.sequence_id)
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
                  this.sortedChromosomeSequenceIndices[this.chromosomeNr?? 0][i] *
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
      // console.log('this.dataGenes', this.dataGenes)

      if (this.dataGenes === undefined) { return }
      const genes: GroupInfo[] = this.dataGenes
        /// connection lines
      if (this.showLinks) {
        this.svg().selectAll('path.connection').remove()
        this.homologyGroups.forEach((homology) => {
          const path_focus = genes.filter(
            (d) => d.homology_id == homology //this.homologyFocus
          )

          // console.log('path focus', path_focus)
          const newPathFocus = path_focus.map((v) => ({
            ...v,
            sequence_id: `${v.genome_number}_${v.sequence_number}`,
          }))
          console.log('newPathFocus', newPathFocus)
          console.log(Object.keys(this.sequenceIdLookup[this.chromosomeNr]))

          let sortOrder = Object.keys(
            this.sequenceIdLookup[this.chromosomeNr]
          )

          let sortedPath = [...newPathFocus].sort(function (a, b) {
            return (
              sortOrder.indexOf(a.sequence_id) -
              sortOrder.indexOf(b.sequence_id)
            )
          })

          // Add the line

          this.svg()
            .append('path')
            .datum(sortedPath)
            .attr('class', 'connection')
            .attr('fill', 'none')
            .attr(
              'stroke',
              vis.colorGenomes ? 'black' : vis.colorScale(String(homology)) as string
            )
            .attr('stroke-width', 1.5)
            .attr(
              'd',
              d3
                .line()
                .x(function (d) {
                  const key = `${d.genome_number}_${d.sequence_number}`
                  let anchorStart = vis.anchorLookup[key]
                  return (
                    vis.margin.left * 3 +
                    vis.xScale(d.mRNA_start_position - anchorStart)
                  )
                })
                .y(function (d, i) {
                  return (
                    vis.margin.top * 2 +
                    vis.barHeight / 2 +
                    // vis.sortedMrnaIndices[vis.chromosomeNr][i] *
                    vis.sequenceIdLookup[vis.chromosomeNr][d.sequence_id] *
                      (vis.barHeight + 10)
                    // i * (vis.barHeight + 10)
                  )
                })
            )
        })
      } else {
        this.svg().selectAll('path.connection').remove()
      }

      this.svg()
        .selectAll('path.gene')
        .data(genes, (d) => d.mRNA_id)
        .join(
          (enter) =>
            enter
              .append('path')
              .attr(
                'd',
                d3
                  .symbol()
                  .size(this.barHeight * 4)
                  .type(d3.symbolTriangle)
                  .type((d) => vis.shapeGenerator[d.homology_id])
                // .type(d3.symbolTriangle)
              )
              .attr('transform', function (d, i) {
                const key = `${d.genome_number}_${d.sequence_number}`
                const shortKey = `${d.genome_number}`
                let transform
                let xTransform = 0
                let yTransform = 0
                const currentScale = vis.xScaleLookup[key]

                if (vis.anchor) {
                  let anchorStart = vis.anchorLookup[key]
                    xTransform = 
                      vis.margin.left * 3 +
                      currentScale(d.mRNA_start_position - anchorStart)
                    yTransform =
                      vis.margin.top * 2 +
                      vis.barHeight / 2 +
                      vis.sortedMrnaIndices[vis.chromosomeNr][i] *
                        (vis.barHeight + 10)

                } else {

                    xTransform = 
                      vis.margin.left * 3 + currentScale(d.gene_start_position)
                    yTransform =
                      vis.margin.top * 2 +
                      vis.barHeight / 2 +
                      vis.sortedMrnaIndices[vis.chromosomeNr][i] *
                        (vis.barHeight + 10)
                  // }
                }
                transform = `translate(${xTransform},${yTransform})`
                return transform
              })
              .attr('class', 'gene')
              .attr('hg', (d: GroupInfo) => d.homology_id ?? 0)
              .attr('z-index', 100)
              .attr('stroke', (d): string =>
                vis.colorGenes
                  ? vis.upstreamHomologies.includes(d.homology_id)
                    ? this.colorScale(String(d.homology_id)) as string
                    : ''
                  : ''
              )
              .attr('stroke-width', (d) =>
                vis.upstreamHomologies.includes(d.homology_id) ? '3px' : ''
              )
              .attr('fill', (d) =>
                vis.colorGenes ? vis.colorScale(String(d.homology_id)) as string : 'black'
              )
              .attr('opacity', 0.8),

          (update) =>
            update
              .transition()
              .duration(this.transitionTime)
              .attr('fill', (d) =>
                vis.colorGenes ? vis.colorScale(String(d.homology_id)) : 'black'
              )
              .attr('stroke-width', (d) =>
                vis.upstreamHomologies.includes(d.homology_id ?? 0) ? '3px' : ''
              )
              .attr('stroke', (d) =>
                vis.colorGenes
                  ? vis.upstreamHomologies.includes(d.homology_id ?? 0)
                    ? vis.colorScale(String(d.homology_id))
                    : ''
                  : ''
              )
              .attr('transform', function (d, i) {
                const key = `${d.genome_number}_${d.sequence_number}`
                const shortKey = `${d.genome_number}`
                let transform
                let xTransform = 0
                let yTransform = 0
                const currentScale = vis.xScaleLookup[key]

                if (vis.anchor) {
                  let anchorStart = vis.anchorLookup[key]
                    xTransform = 
                      vis.margin.left * 3 +
                      currentScale(d.mRNA_start_position - anchorStart)
                    yTransform =
                      vis.margin.top * 2 +
                      vis.barHeight / 2 +
                      vis.sortedMrnaIndices[vis.chromosomeNr][i] *
                        (vis.barHeight + 10)

                } else {

                    xTransform = 
                      vis.margin.left * 3 + currentScale(d.gene_start_position)
                    yTransform =
                      vis.margin.top * 2 +
                      vis.barHeight / 2 +
                      vis.sortedMrnaIndices[vis.chromosomeNr][i] *
                        (vis.barHeight + 10)
                  // }
                }
                transform = `translate(${xTransform},${yTransform})`
                return transform
             
              }),


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
                  console.log(
                    d.sequence_id,
                    i,
                    this.sequenceIdLookup[5][d.sequence_id]
                  )
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
    this.svgWidth =
      document.getElementById('content').offsetWidth * this.svgWidthScaleFactor

    if (this.chromosomeNr == 'unphased') {
      this.sortedChromosomeSequenceIndices[12].length * (this.barHeight + 10) +
        this.margin.top * 2
    } else {
      this.svgHeight = document.getElementById('contentChr').offsetHeight
      console.log('this.svgHeight', this.svgHeight)
    }

    // Anchor
    ////
    //1.find all cdf 1
    const homologyAnchor = this.dataGenes?.filter(
      (gene) => gene.homology_id === this.homologyFocus
    )
    // console.log('geneSet', this.dataGenes, homologyAnchor)

    let anchorLookup: Dictionary<number> = {}
    homologyAnchor?.forEach((item) => {
      const key = `${item.genome_number}_${item.sequence_number}`
      anchorLookup[key] = item.mRNA_start_position
    })
    // console.log('anchorLookup', anchorLookup)
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
    let xScaleLookup:Dictionary<d3.ScaleLinear<number, number, never>> = {}
    let xScaleBasic:Dictionary<d3.ScaleLinear<number, number, never>> = {}
    let calculateXScale = (range: number[], genes?: GroupInfo[]) => {
      if(genes === undefined || genes.length === 0) {
        return d3.scaleLinear().rangeRound(range).domain([-anchorMax, anchorMax])
      }
      
      const uniquePositions: number[] = []
      const uniquePositionGenes = genes.filter(d => {
        if(uniquePositions.includes(d.gene_start_position)) {return false}

        uniquePositions.push(d.gene_start_position)
        return true
      })

      let genePositions = uniquePositionGenes.map(gene => gene.gene_start_position).sort((a,b) => a-b)
      const nGenes = uniquePositionGenes.length
      const rangeAtom = nGenes === 0 ? 10 : round((range[1] - range[0]) / nGenes)
      const dividedRange = [...Array(nGenes)].map((d, i) => i * rangeAtom) 
      // make sure all scales have the same end range
      dividedRange[dividedRange.length - 1] = range[1]
      
      const key = `${genes[0].genome_number}_${genes[0].sequence_number}`
      const anchorValue = anchorLookup[key]
      genePositions = genePositions.map(pos => pos - anchorValue)

      return d3.scaleLinear().rangeRound(dividedRange).domain(genePositions)
    }

    this.data?.forEach(sequence => {
      const key = sequence.sequence_id
      let range = [
              0,
              this.visWidth - this.margin.yAxis + this.margin.left * 4,
            ]

      let scale = calculateXScale(
        range, 
        this.dataGenes?.filter(d =>  `${d.genome_number}_${d.sequence_number}` === key)
      )
      xScaleLookup[key] = scale
      xScaleBasic[key] = calculateXScale(
        range, 
        this.dataGenes?.filter(d =>  `${d.genome_number}_${d.sequence_number}` === key)
      )
    })
    this.xScaleLookup = xScaleLookup
    this.xScaleBasic = xScaleBasic

    this.drawXAxis() // draw axis once

    this.draw()

    // Add brushing
    var brush = d3
      .brushX() // Add the brush feature using the d3.brush function
      .extent([
        [this.margin.left * 3, 0],
        [this.visWidth - (this.margin.left * 3), this.visHeight],
      ])
      .on('end', this.updateChart)

    this.brush = brush

    var zoom = d3
      .zoom()
      .on("zoom", this.updateZoom)
     d3.select(document.getElementById('contentChr')).call(zoom)
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

.label-chr {
  fill: #c0c0c0;
  font-size: 12;
  font-family: sans-serif;
}

.asterisk {
  stroke: red;
  stroke-width: 2px;
}
</style>

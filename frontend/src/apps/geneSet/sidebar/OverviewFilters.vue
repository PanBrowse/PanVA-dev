<!-- <template>
  <SidebarItem title="Filters Overview">
    <div id="sequence-chart-container">
      <svg id="sequence-length-chart"></svg>
    </div>
    <AForm
      layout="horizontal"
      :labelCol="{ span: 10 }"
      :wrapperCol="{ span: 14 }"
      class="view-options"
    >
      <AFormItem label="Filter genomes">
        <ASelect
          v-model:value="selectedGenomes"
          :options="genomeOptions"
          placeholder="Choose genomes"
          style="width: 100%"
          mode="multiple"
          :dropdownMatchSelectWidth="false"
          showSearch
          showArrow
        />
      </AFormItem>
      <AFormItem label="Filter sequences">
        <ASelect
          v-model:value="selectedSequences"
          :options="sequenceOptions"
          placeholder="Choose sequences"
          style="width: 100%"
          mode="multiple"
          :dropdownMatchSelectWidth="false"
          showSearch
          showArrow
        />
      </AFormItem>
    </AForm>
  </SidebarItem>
</template>

<script lang="ts">
import { Form, FormItem, Select } from 'ant-design-vue'
import * as d3 from 'd3'
import { mapState, mapWritableState } from 'pinia'
import { computed, defineComponent } from 'vue'

import SidebarItem from '@/components/SidebarItem.vue'
import { useGenomeStore } from '@/stores/geneSet'

export default defineComponent({
  data() {
    return {
      svgWidth: 330,
      svgHeight: 100,
    }
  },
  components: {
    AForm: Form,
    AFormItem: FormItem,
    ASelect: Select,
    SidebarItem,
  },
  computed: {
    ...mapWritableState(useGenomeStore, [
      'selectedGenomes',
      'selectedSequences',
    ]),
    ...mapState(useGenomeStore, ['genomeData']),

    // Compute the options for the genome select dropdown
    genomeOptions() {
      const genomeStore = useGenomeStore()
      return genomeStore.genomeNames.map((name) => ({
        label: name,
        value: name,
      }))
    },
    // Compute the options for the genome select dropdown
    sequenceOptions() {
      const genomeStore = useGenomeStore()
      return genomeStore.sequenceNames.map((name) => ({
        label: name,
        value: name,
      }))
    },
  },
  watch: {
    // Watch selectedGenomes for changes
    selectedGenomes(newVal) {
      console.log('selectedGenomes updated:', newVal)
    },
    selectedSequences(newVal) {
      console.log('selectedSequences updated:', newVal)
    },
  },
  mounted() {
    // Extract sequence lengths from genomeData
    const sequenceLengths = this.genomeData.genomes
      .flatMap((genome) =>
        genome.sequences.map((seq) => ({
          name: seq.name,
          uid: seq.uid,
          length: seq.sequence_length_nuc,
        }))
      )
      .sort((a, b) => b.length - a.length)

    // Set chart dimensions
    this.svgWidth = 330
    this.svgHeight = 100
    const margin = { top: 10, right: 10, bottom: 20, left: 50 }
    const xPadding = 2

    const svg = d3
      .select('#sequence-length-chart')
      .attr('width', this.svgWidth)
      .attr('height', this.svgHeight + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Create scales for x and y axes
    const x = d3
      .scaleBand()
      .domain(sequenceLengths.map((d) => d.uid))
      .range([xPadding, this.svgWidth - margin.left - margin.right])
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(sequenceLengths, (d) => d.length)!])
      .range([this.svgHeight, 0])

    // Create bars
    svg
      .selectAll('rect')
      .data(sequenceLengths)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.uid)!)
      .attr('y', (d) => y(d.length))
      .attr('width', x.bandwidth())
      .attr('height', (d) => this.svgHeight - y(d.length)) // Height from y position to bottom
      .attr('fill', '#d3d3d3')

    // Y Axis

    const maxSequenceLength = d3.max(sequenceLengths, (d) => d.length)
    const yAxisTickValues = [0, maxSequenceLength].filter(
      (d): d is number => d !== undefined
    )
    svg
      .append('g')
      .call(
        d3
          .axisLeft(y)
          .tickValues(yAxisTickValues)
          .tickFormat((d) => `${(Number(d) / 1_000_000).toFixed(2)} Mb`)
      )
      .selectAll('text')
      .style('font-size', '10px')

    const yAxisLabel = svg
      .append('text')
      .attr('class', 'axis-title')
      .attr('x', 0)
      .attr('y', 0)
      .attr('dy', '.71em')
      .attr('fill', 'rgba(0, 0, 0, 0.85)')
      .attr('font-size', '14px')
      .attr('text-anchor', 'start')
      .text('Sequence length')

    // Calculate the width of the text element
    const textWidth = yAxisLabel.node()!.getBBox().width
    // console.log('text width', textWidth)

    // Adjust the x position based on the text width and svg width
    yAxisLabel.attr('x', this.svgWidth - textWidth - margin.left)

    // Add a brush for horizontal selection
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [this.svgWidth - margin.left - margin.right, this.svgHeight],
      ])
      .on('brush end', (event) => {
        const selection = event.selection
        if (selection) {
          const [x0, x1] = selection
          const selectedData = sequenceLengths.filter((d) => {
            const xPosition = x(d.uid)! + x.bandwidth() / 2
            return xPosition >= x0 && xPosition <= x1
          })
          console.log('Selected data:', selectedData)

          // Update the colors of all bars based on selection
          svg.selectAll('.bar').style('fill', function (d) {
            const xPosition = x(d.uid)! + x.bandwidth() / 2
            return xPosition >= x0 && xPosition <= x1 ? '#007bff' : '#e0e0e0'
          })
        } else {
          // If no selection, reset all bars to the default color
          svg.selectAll('.bar').style('fill', '#d3d3d3')
        }
      })

    svg.append('g').attr('class', 'brush').call(brush)
  },
})
</script>

<style>
.ant-form-item-label {
  text-align: left !important;
}

g.brush .selection {
  fill: #007bff;
  stroke: none;
  fill-opacity: 0.3;
}
</style> -->

<template>
  <SidebarItem title="Filters Overview">
  
    <div id="sequence-chart-container">
      <svg id="sequence-length-chart"></svg>
    </div>
    <!-- <svg width="100%" height="1">
      <line x1="0" y1="0" x2="100%" y2="0" stroke="#d9d9d9" stroke-width="1" />
    </svg> -->
    <div id="gene-count-chart-container">
      <svg id="gene-count-chart"></svg>
    </div>
    <div id="loci-count-chart-container">
      <svg id="loci-count-chart"></svg>
    </div>
    <AForm
      layout="horizontal"
      :labelCol="{ span: 10 }"
      :wrapperCol="{ span: 14 }"
      class="view-options"
    >
     
      <AFormItem label="Filter genomes">
        <ASelect
          v-model:value="selectedGenomes"
          :options="genomeOptions"
          placeholder="Choose genomes"
          style="width: 100%"
          mode="multiple"
          :dropdownMatchSelectWidth="false"
          showSearch
          showArrow
        />
      </AFormItem>
      <AFormItem label="Filter sequences">
        <ASelect
          v-model:value="selectedSequences"
          :options="sequenceOptions"
          placeholder="Choose sequences"
          style="width: 100%"
          mode="multiple"
          :dropdownMatchSelectWidth="false"
          showSearch
          showArrow
        />
        
      </AFormItem>
      <AFormItem label="Filter empty">
            <ASwitch size="small" v-model:checked="filterEmpty"/>
      </AFormItem>
    </AForm>
  </SidebarItem>
</template>

<script lang="ts">
import { Form, FormItem, Select, Switch } from 'ant-design-vue'
import * as d3 from 'd3'
import { mapState, mapWritableState } from 'pinia'
import { defineComponent } from 'vue'

import SidebarItem from '@/components/SidebarItem.vue'
import { useGenomeStore } from '@/stores/geneSet'

export default defineComponent({
  data() {
    return {
      svgWidth: 330,
      svgHeight: 60,
    }
  },
  components: {
    AForm: Form,
    AFormItem: FormItem,
    ASelect: Select,
    SidebarItem,
    ASwitch: Switch,
  },
  computed: {
    ...mapWritableState(useGenomeStore, [
      'selectedGenomes',
      'selectedSequences',
    ]),
    ...mapState(useGenomeStore, ['genomeData']),
    ...mapWritableState(useGenomeStore, ['filterEmpty']),


    genomeOptions() {
      const genomeStore = useGenomeStore()
      return genomeStore.genomeNames.map((name) => ({
        label: name,
        value: name,
      }))
    },
    sequenceOptions() {
      const genomeStore = useGenomeStore()
      return genomeStore.sequenceNames.map((name) => ({
        label: name,
        value: name,
      }))
    },
  },
  mounted() {
    this.renderChart({
      containerId: 'sequence-length-chart',
      data: this.getSequenceLengths(),
      yDomainKey: 'length',
      yLabel: 'Sequence length',
      tickFormat: (d) => `${(Number(d) / 1_000_000).toFixed(2)} Mb`,
    })

    this.renderChart({
      containerId: 'gene-count-chart',
      data: this.getGeneCounts(),
      yDomainKey: 'count',
      yLabel: 'Sequence gene count',
      tickFormat: (d) => d.toLocaleString(),
    })
    this.renderChart({
      containerId: 'loci-count-chart',
      data: this.getLociCounts(),
      yDomainKey: 'count',
      yLabel: 'Sequence Loci count',
      tickFormat: (d) => d.toLocaleString(),
    })
  },
  watch: {
    filterEmpty(newValue) {
      const genomeStore = useGenomeStore();
      console.log('Filter empty changed:', newValue);
      genomeStore.initializeSelectedSequencesLasso(); // Reinitialize lasso selection
      // genomeStore.selectedSequencesLasso = [];
    },
  },
  methods: {
    getSequenceLengths() {
      return this.genomeData.genomes
        .flatMap((genome) =>
          genome.sequences.map((seq) => ({
            name: seq.name,
            uid: seq.uid,
            length: seq.sequence_length_nuc,
          }))
        )
        .sort((a, b) => b.length - a.length)
    },

    getGeneCounts() {
      return this.genomeData.genomes
        .flatMap((genome) =>
          genome.sequences.map((seq) => ({
            name: seq.name,
            uid: seq.uid,
            count: seq.gene_count,
          }))
        )
        .sort((a, b) => b.count - a.count)
    },

    getLociCounts() {
      return this.genomeData.genomes
        .flatMap((genome) =>
          genome.sequences.map((seq) => ({
            name: seq.name,
            uid: seq.uid,
            count: seq.loci.length,
          }))
        )
        .sort((a, b) => b.count - a.count)
    },

    renderChart({ containerId, data, yDomainKey, yLabel, tickFormat }) {
      const margin = { top: 10, right: 10, bottom: 20, left: 50 }
      const svg = d3
        .select(`#${containerId}`)
        .attr('width', this.svgWidth)
        .attr('height', this.svgHeight + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)

      const x = d3
        .scaleBand()
        .domain(data.map((d) => d.uid))
        .range([2, this.svgWidth - margin.left - margin.right])
      const y = d3
        .scaleLinear()
        .domain([0, d3.max(data, (d) => d[yDomainKey])!])
        .range([this.svgHeight, 0])

      svg
        .selectAll('rect')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', (d) => x(d.uid)!)
        .attr('y', (d) => y(d[yDomainKey]))
        .attr('width', x.bandwidth())
        .attr('height', (d) => this.svgHeight - y(d[yDomainKey]))
        .attr('fill', '#d3d3d3')

      // Calculate min and max values for the y-axis
      const yMin = 0
      const yMax = d3.max(data, (d) => d[yDomainKey]) || 0
      const yAxisTickValues = [yMin, yMax]

      const yAxis = d3.axisLeft(y)
      if (tickFormat) {
        yAxis.tickFormat(tickFormat)
      }
      svg
        .append('g')
        .call(yAxis.tickValues(yAxisTickValues))
        .selectAll('text')
        .style('font-size', '10px')

      // Y Axis Label
      const yAxisLabel = svg
        .append('text')
        .attr('class', 'axis-title')
        .attr('x', -margin.left)
        .attr('y', 0)
        .attr('dy', '.71em')
        .attr('fill', 'rgba(0, 0, 0, 0.85)')
        .attr('font-size', '14px')
        .attr('text-anchor', 'start')
        .text(yLabel)

      // Calculate the width of the text element
      const textWidth = yAxisLabel.node()!.getBBox().width
      // console.log('text width', textWidth)

      // Adjust the x position based on the text width and svg width
      yAxisLabel.attr('x', this.svgWidth - textWidth - margin.left)

      // Brush for horizontal selection
      const brush = d3
        .brushX()
        .extent([
          [0, 0],
          [this.svgWidth - margin.left - margin.right, this.svgHeight],
        ])
        .on('brush end', (event) => {
          const selection = event.selection
          if (selection) {
            const [x0, x1] = selection
            const selectedData = data.filter((d) => {
              const xPosition = x(d.uid)! + x.bandwidth() / 2
              return xPosition >= x0 && xPosition <= x1
            })
            console.log('Selected data:', selectedData)

            // Update the colors of all bars based on selection
            svg.selectAll('.bar').style('fill', function (d) {
              const xPosition = x(d.uid)! + x.bandwidth() / 2
              return xPosition >= x0 && xPosition <= x1 ? '#007bff' : '#d3d3d3'
            })
          } else {
            // If no selection, reset all bars to the default color
            svg.selectAll('.bar').style('fill', '#d3d3d3')
          }
        })

      svg.append('g').attr('class', 'brush').call(brush)
    },
  },
})
</script>

<style>
.ant-form-item-label {
  text-align: left !important;
}

g.brush .selection {
  fill: #007bff;
  stroke: none;
  fill-opacity: 0.3;
}
</style>

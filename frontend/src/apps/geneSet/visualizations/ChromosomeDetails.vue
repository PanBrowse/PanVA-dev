<template>
  <div
    id="content-focus"
    style="
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: space-between;
    "
  >
    <FocusView
      v-bind:key="`chr${chrFocus}_focus`"
      :chromosomeNr="String(chrFocus)"
      :name="`chr${chrFocus}_focus`"
      :data="getChromosome(String(chrFocus))"
      :dataGenes="getGroupInfo(String(chrFocus))"
      :dataMin="dataMin"
      :dataMax="dataMax"
      :maxGC="GCcontentMax"
      :minGC="GCcontentMin"
    />
  </div>
</template>

<script lang="ts">
import * as d3 from 'd3'
import { mapActions, mapState } from 'pinia'

import { filterOutliers } from '@/helpers/chromosome'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGlobalStore } from '@/stores/global'
import type { SequenceMetrics } from '@/types'

import FocusView from './FocusView.vue'
import SequencesDetails from './SequencesDetails.vue'

export default {
  components: {
    // SequencesDetails,
    FocusView,
  },
  data: () => ({
    svgWidth: 0,
    svgHeight: 0,
    svgWidthScaleFactor: 1,
    svgHeightScaleFactor: 1,
    margin: { top: 10, bottom: 10, right: 10, left: 10, yAxis: 40 },
    transitionTime: 750,
  }),
  computed: {
    ...mapState(useGeneSetStore, [
      'sequences',
      'groupInfo',
      'chromosomes',
      'numberOfChromosomes',
      'chrFocus',
      'chromosomeLookup',
      'groupInfoLookup',
      'sortedGroupInfoLookup',
      'sequenceIdLookup',
    ]),

    dataMax() {
      return d3.max(this.sequences, (d) => d.sequence_length) ?? 0
    },
    dataMin() {
      return d3.min(this.sequences, (d) => d.sequence_length) ?? 0
    },
    GCfiltered(): number[] {
      const CGcontentArray = this.sequences.map((d) => d.GC_content_percent)
      return filterOutliers(CGcontentArray as number[])
    },
    GCcontentMax() {
      return Number(d3.max(this.GCfiltered, (d) => d) ?? 0)
    },
    GCcontentMin() {
      return Number(d3.min(this.GCfiltered, (d) => d) ?? 0)
    },
  },
  methods: {
    ...mapActions(useGeneSetStore, [
      'getChromosome',
      'getGroupInfo',
      'changeSorting',
    ]),
  },
  created() {},
  mounted() {
    // console.log('Chromosome details mounted')

    const contentElement = document.getElementById('content-focus')
    this.svgWidth =
      (contentElement?.offsetWidth || 0) * this.svgWidthScaleFactor
    this.svgHeight =
      (contentElement?.offsetHeight || 0) * this.svgHeightScaleFactor
  },
  watch: {},
}
</script>

<style lang="scss">
@import '@/assets/colors.module.scss';
</style>

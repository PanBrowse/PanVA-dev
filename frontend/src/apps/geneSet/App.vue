<script lang="ts">
import { Col, Form, FormItem, Row, Select } from 'ant-design-vue'
import { computed, defineComponent, onMounted, ref, watch } from 'vue'

import Layout from '@/components/Layout.vue'
import LoadingScreen from '@/components/LoadingScreen.vue'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGenomeStore } from '@/stores/geneSet'

import ContextOptions from './sidebar/ContextOptions.vue'
import Filters from './sidebar/Filters.vue'
import GraphicsOptions from './sidebar/GraphicsOptions.vue'
import HomologyOverview from './sidebar/HomologyOverview.vue'
import OverviewFilters from './sidebar/OverviewFilters.vue'
import Sorting from './sidebar/Sorting.vue'
import Unphased from './sidebar/Unphased.vue'
import ChromosomeDetails from './visualizations/ChromosomeDetails.vue'
import ChromosomeOverview from './visualizations/ChromosomeOverview.vue'
import Density from './visualizations/Density.vue'
import GroupInfoTable from './visualizations/GroupInfoTable.vue'
import PixiCanvas from './visualizations/PixiScatter.vue'

export default defineComponent({
  name: 'App',
  components: {
    Layout,
    LoadingScreen,
    OverviewFilters,
    Filters,
    Sorting,
    GraphicsOptions,
    ContextOptions,
    Unphased,
    ChromosomeDetails,
    // GroupInfoTable,
    PixiCanvas,
    ARow: Row,
    ACol: Col,
  },
  setup() {
    const geneSetStore = useGeneSetStore()
    const genomeStore = useGenomeStore()
    const pixiLoaded = ref(false)

    const handlePixiLoaded = () => {
      try {
        console.log('PixiScatter loaded event received in App.vue')
        pixiLoaded.value = true
      } catch (error) {
        console.error('Error handling PixiScatter loaded event:', error)
      }
    }
    // Trigger loading of genome data
    genomeStore.loadGenomeData()
    const isInitializedGenome = computed(() => genomeStore.isInitialized)

    // Computed properties for state
    const isInitialized = computed(() => geneSetStore.isInitialized)
    const showTable = computed(() => geneSetStore.showTable)
    const showDetails = computed(() => geneSetStore.showDetails)

    // Sample chromosome number for demonstration
    const chromosomeNr = 5

    console.log('isInitialized:', isInitialized.value)
    console.log('isInitializedGenome:', isInitializedGenome.value)

    // Watchers to observe initialization state changes
    watch([isInitialized, isInitializedGenome], ([geneInit, genomeInit]) => {
      console.log('isInitialized:', geneInit)
      console.log('isInitializedGenome:', genomeInit)
    })

    // Trigger loading on component mount
    onMounted(() => {
      try {
        if (!isInitialized.value) {
          geneSetStore.initialize()
        }
        if (!isInitializedGenome.value) {
          genomeStore.loadGenomeData()
        }
      } catch (error) {
        console.error('Error during component initialization:', error)
      }
    })

    return {
      isInitialized,
      isInitializedGenome,
      showTable,
      showDetails,
      chromosomeNr,
      pixiLoaded,
      handlePixiLoaded,
    }
  },
})
</script>

<template>
  <Layout v-if="isInitialized && isInitializedGenome">
    <template #sidebar>
      <OverviewFilters />
      <Filters />
      <Sorting />
      <GraphicsOptions />
      <ContextOptions />
      <Unphased />
    </template>

    <!-- Row 1: PixiCanvas Visualization -->
    <ARow type="flex" :gutter="8" class="row">
      <ACol :span="12" class="overview-height">
        <div class="content-overview" ref="parentElement">
          <PixiCanvas @loaded="handlePixiLoaded" />
        </div>
      </ACol>
      <ACol v-if="pixiLoaded" :span="12" class="focus-height">
        <ChromosomeDetails />
        <!-- <GroupInfoTable /> -->
      </ACol>
    </ARow>

    <!-- Row 2: Sequence Details (ChromosomeDetails) -->
    <!-- <ARow type="flex" :gutter="8" class="row">
      <ACol :span="24" class="focus-height">
        <ChromosomeDetails :chromosomeNr="String(chromosomeNr)" />
      </ACol>
    </ARow> -->
  </Layout>
  <LoadingScreen v-else>Loading data, please wait...</LoadingScreen>
</template>

<style>
.ant-layout-sider {
  background: #fafafa !important;
}

.content-overview {
  flex: 1;
  display: flex;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.overview-height {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.focus-height {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Ensure ant-layout and ant-layout-content take up full viewport height */
.ant-layout {
  height: 100vh;
  display: flex;
}

.ant-layout-content {
  padding: 0; /* Remove padding here, add it to child elements if needed */
  flex: 1;
  display: flex;
  flex-direction: column; /* Allows row to take full height */
}

/* Adjust row to inherit height and add margin for spacing */
.row {
  flex: 1;
  overflow: hidden; /* Prevent overflow */
  display: flex; /* Ensures child columns also flex */
}
</style>

<script lang="ts">
import {
  Button,
  Col,
  Form,
  FormItem,
  RadioGroup,
  Row,
  Select,
} from 'ant-design-vue'
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
import PixiUMAP from './visualizations/PixiUMAP.vue'

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
    PixiUMAP,
    ARow: Row,
    ACol: Col,
    AButton: Button,
    ARadioGroup: RadioGroup,
  },
  setup() {
    const geneSetStore = useGeneSetStore()
    const genomeStore = useGenomeStore()
    const pixiLoaded = ref(false)
    // const showPixiScatter = ref(true) // true for PixiScatter, false for PixiUMAP

    const handlePixiLoaded = () => {
      try {
        console.log('PixiScatter loaded event received in App.vue')
        pixiLoaded.value = true
      } catch (error) {
        console.error('Error handling PixiScatter loaded event:', error)
      }
    }

    // const toggleVisualization = () => {
    //   showPixiScatter.value = !showPixiScatter.value
    // }

    const selectedVisualization = ref('PixiUMAP') // Default to PixiScatter

    // Define options for Radio Group
    const visualizationOptions = [
      { label: 'Grid', value: 'PixiScatter' },
      { label: 'UMAP', value: 'PixiUMAP' },
    ]

    // Computed properties to control which component to render
    const showPixiScatter = computed(
      () => selectedVisualization.value === 'PixiScatter'
    )
    const showPixiUMAP = computed(
      () => selectedVisualization.value === 'PixiUMAP'
    )

    // Trigger loading of genome data
    genomeStore.loadGenomeData()
    const isInitializedGenome = computed(() => genomeStore.isInitialized)

    // Computed properties for state
    const isInitialized = computed(() => geneSetStore.isInitialized)
    const showTable = computed(() => geneSetStore.showTable)
    const showDetails = computed(() => geneSetStore.showDetails)

    const distanceMatrix = computed(() => genomeStore.distanceMatrix)
    const embedding = computed(() => genomeStore.embedding)

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
      // toggleVisualization,
      selectedVisualization,
      visualizationOptions,
      showPixiScatter,
      showPixiUMAP,

      distanceMatrix,
      embedding,
    }
  },
})
</script>

<template>
  <Layout v-if="isInitialized && isInitializedGenome">
    <template #sidebar>
      <!-- <AButton type="primary" @click="toggleVisualization">
        Toggle Overview Visualization
      </AButton> -->
      <div class="radio-group-container">
        <ARadioGroup
          v-model:value="selectedVisualization"
          option-type="button"
          :options="visualizationOptions"
        />
      </div>
      <OverviewFilters />
      <Filters />
      <Sorting />
      <GraphicsOptions />
      <ContextOptions />
      <Unphased />
    </template>

    <!-- Row 1: PixiCanvas Visualization -->
    <ARow type="flex" :gutter="8" class="row full-height">
      <ACol :span="12" class="col full-height">
        <div class="content-overview" ref="parentElement">
          <PixiCanvas v-if="showPixiScatter" @loaded="handlePixiLoaded" />
          <PixiUMAP
            v-if="showPixiUMAP"
            :distanceMatrix="distanceMatrix"
            @loaded="handlePixiLoaded"
          />
        </div>
      </ACol>
      <ACol v-if="pixiLoaded" :span="12" class="col full-height">
        <!-- <ChromosomeDetails /> -->
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
.radio-group-container {
  display: flex;
  justify-content: center; /* Center horizontally */
  align-items: center; /* Center vertically if needed */
  padding: 16px; /* Adjust padding as needed */
}

.ant-layout-sider {
  background: #fafafa !important;
}

.ant-layout {
  height: 100vh;
  display: flex;
}

.ant-layout-content {
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* .overview-height {
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
} */

.full-height {
  height: 100%;
}

/* ACol styling */
.col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.row {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.content-overview {
  flex: 1;
  display: flex;
  overflow: hidden;
  width: 100%;
  height: 100%;
}
</style>

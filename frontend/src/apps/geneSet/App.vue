<script lang="ts">
import { Col, Form, FormItem, Row, Select } from 'ant-design-vue'
import { computed, defineComponent, onMounted } from 'vue'

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
    HomologyOverview,
    OverviewFilters,
    Filters,
    Sorting,
    GraphicsOptions,
    ContextOptions,
    Unphased,
    // ChromosomeOverview,
    ChromosomeDetails,
    Density,
    GroupInfoTable,
    PixiCanvas,
    AForm: Form,
    AFormItem: FormItem,
    ARow: Row,
    ACol: Col,
  },
  setup() {
    const geneSetStore = useGeneSetStore()
    const genomeStore = useGenomeStore()

    const isInitialized = computed(() => geneSetStore.isInitialized)
    const showTable = computed(() => geneSetStore.showTable)
    const showDetails = computed(() => geneSetStore.showDetails)

    onMounted(() => {
      genomeStore.loadGenomeData()
    })

    return {
      isInitialized,
      showTable,
      showDetails,
    }
  },
})
</script>

<template>
  <Layout v-if="isInitialized">
    <template #sidebar>
      <HomologyOverview />
      <OverviewFilters />
      <Filters />
      <Sorting />
      <GraphicsOptions />
      <ContextOptions />
      <Unphased />
    </template>

    <div class="content" ref="parentElement">
      <PixiCanvas />
    </div>

    <!-- <template v-if="showTable && showDetails">
      <ARow type="flex" :gutter="8">
        <ACol :span="12">
          <ChromosomeDetails />
        </ACol>
        <ACol :span="12">
          <GroupInfoTable />
        </ACol>
      </ARow>
    </template>

    <GroupInfoTable v-if="showTable && !showDetails"></GroupInfoTable>
    <ChromosomeDetails v-if="!showTable && showDetails"></ChromosomeDetails> -->
  </Layout>
  <LoadingScreen v-else>Loading data, please wait...</LoadingScreen>
</template>

<style>
.ant-layout-sider {
  background: #fafafa !important;
}

.content {
  flex: 1;
  display: flex;
  overflow: hidden;
  width: 100%;
  height: 100%;
}
</style>

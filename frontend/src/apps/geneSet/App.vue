<script setup lang="ts">
import { Col, Form, FormItem, Row, Select } from 'ant-design-vue'
import { mapState } from 'pinia'
import { computed, onMounted } from 'vue' // Import computed and any other reactivity functions you need

import Layout from '@/components/Layout.vue'
import LoadingScreen from '@/components/LoadingScreen.vue'
// import Homologies from './visualizations/Homologies.vue'
import PixiCanvas from '@/components/PixiScatter.vue'
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

// export default {
//   components: {
//     // Homologies,
//     ChromosomeOverview,
//     ChromosomeDetails,
//     Layout,
//     LoadingScreen,
//     Sorting,
//     Unphased,
//     Filters,
//     ContextOptions,
//     GraphicsOptions,
//     GroupInfoTable,
//     ARow: Row,
//     ACol: Col,
//     HomologyOverview,
//     PixiCanvas,
//   },
//   computed: {
//     ...mapState(useGeneSetStore, ['isInitialized', 'showTable', 'showDetails']),
//   },
// }
const geneSetStore = useGeneSetStore()
const genomeStore = useGenomeStore()
// Access state and computed properties if needed
const isInitialized = computed(() => geneSetStore.isInitialized)
const showTable = computed(() => geneSetStore.showTable)
const showDetails = computed(() => geneSetStore.showDetails)

// Load genome data when the component is mounted
onMounted(() => {
  genomeStore.loadGenomeData()
})
</script>

<!-- <template>
  <div>
    <PixiCanvas />
  </div>
</template> -->

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

    <!-- <template>
      <Row type="flex" :gutter="8">
        <div class="content" ref="parentElement">
          <PixiCanvas />
        </div>
      </Row>
    </template> -->
    <!-- 
    <template v-if="showTable && showDetails">
      <ARow type="flex" :gutter="8">
        <ACol :span="12">
          <ChromosomeDetails />
        </ACol>
        <ACol :span="12">
          <GroupInfoTable />
        </ACol>
      </ARow>
    </template>
    <GroupInfoTable v-if="showTable && showDetails == false"></GroupInfoTable>
    <ChromosomeDetails
      v-if="showTable == false && showDetails"
    ></ChromosomeDetails> -->

    <!-- <Homologies /> -->
  </Layout>
  <LoadingScreen v-else>Loading data, please wait...</LoadingScreen>
</template>

<!-- <template>
  <Layout v-if="isInitialized">
    <template #sidebar>
      <HomologyOverview />
      <Filters />
      <Sorting />
      <GraphicsOptions />
      <ContextOptions />
      <Unphased />
    </template> -->

<!-- <ChromosomeOverview /> -->
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
    <GroupInfoTable v-if="showTable && showDetails == false"></GroupInfoTable>
    <ChromosomeDetails
      v-if="showTable == false && showDetails"
    ></ChromosomeDetails> -->

<!-- <Homologies /> -->
<!-- </Layout>
  <LoadingScreen v-else>Loading data, please wait...</LoadingScreen>
</template> -->

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

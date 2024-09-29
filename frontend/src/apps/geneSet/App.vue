<script lang="ts">
import { Col, Row } from 'ant-design-vue'
import { mapState } from 'pinia'

import Layout from '@/components/Layout.vue'
import LoadingScreen from '@/components/LoadingScreen.vue'
// import Homologies from './visualizations/Homologies.vue'
import PixiCanvas from '@/components/PixiScatter.vue'
import { useGeneSetStore } from '@/stores/geneSet'

import ContextOptions from './sidebar/ContextOptions.vue'
import Filters from './sidebar/Filters.vue'
import GraphicsOptions from './sidebar/GraphicsOptions.vue'
import HomologyOverview from './sidebar/HomologyOverview.vue'
import Sorting from './sidebar/Sorting.vue'
import Unphased from './sidebar/Unphased.vue'
import ChromosomeDetails from './visualizations/ChromosomeDetails.vue'
import ChromosomeOverview from './visualizations/ChromosomeOverview.vue'
import Density from './visualizations/Density.vue'
import GroupInfoTable from './visualizations/GroupInfoTable.vue'

export default {
  components: {
    // Homologies,
    ChromosomeOverview,
    ChromosomeDetails,
    Layout,
    LoadingScreen,
    Sorting,
    Unphased,
    Filters,
    ContextOptions,
    GraphicsOptions,
    GroupInfoTable,
    ARow: Row,
    ACol: Col,
    HomologyOverview,
    PixiCanvas,
  },
  computed: {
    ...mapState(useGeneSetStore, ['isInitialized', 'showTable', 'showDetails']),
  },
}
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
      <Filters />
      <Sorting />
      <GraphicsOptions />
      <ContextOptions />
      <Unphased />
    </template>

    <div class="content">
      <PixiCanvas />
    </div>

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
}

.pixi-container {
  width: 100%;
  height: 100%;
}
</style>

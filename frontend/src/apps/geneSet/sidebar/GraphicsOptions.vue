<script lang="ts">
import { Col, Form, FormItem, Row, Switch } from 'ant-design-vue'
import { mapWritableState } from 'pinia'

import SidebarItem from '@/components/SidebarItem.vue'
import { useGeneSetStore } from '@/stores/geneSet'

export default {
  components: {
    SidebarItem,
    ASwitch: Switch,
    AForm: Form,
    AFormItem: FormItem,
    ARow: Row,
    ACol: Col,
  },
  computed: {
    ...mapWritableState(useGeneSetStore, [
      'percentageGC',
      'allSequences',
      'colorGenomes',
      'overviewArrows',
      'showTable',
      'showDetails',
      'showNotificationsDetail',
      'showNotificationsOverview',
      'anchor',
      'colorGenes',
      'showLinks',
    ]),
  },
  
}
</script>

<template>
  <SidebarItem title="Graphics Options">
    <AForm
      layout="horizontal"
      :labelCol="{ span: 16 }"
      :wrapperCol="{ span: 16 }"
      class="view-options"
    >
      <h4 class="graphics">FOCUS VIEW</h4>
      <ARow type="flex">
        <ACol :span="12">
          <AFormItem label="Show links">
            <ASwitch size="small" v-model:checked="showLinks"
          /></AFormItem>
          <AFormItem label="Color genomes">
            <ASwitch size="small" v-model:checked="colorGenomes"
          /></AFormItem>
        </ACol>
      </ARow>
    </AForm>
  </SidebarItem>
</template>

<style lang="scss">
@import '@/assets/colors.module.scss';

.graphics {
  color: $gray-7;
  text-align: left;
}
</style>

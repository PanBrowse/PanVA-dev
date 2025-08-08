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
    ]),
  },
}
</script>

<template>
  <SidebarItem title="Sequence Context">
    <AForm
      layout="horizontal"
      :labelCol="{ span: 16 }"
      :wrapperCol="{ span: 16 }"
      class="view-options"
    >
      <ARow type="flex">
        <ACol :span="12">
          <AFormItem label="Color genomes">
            <ASwitch size="small" v-model:checked="colorGenomes"
          /></AFormItem>
        </ACol>
       
      </ARow>
    </AForm>
  </SidebarItem>
</template>

<script lang="ts">
import {
  Button,
  Col,
  Form,
  FormItem,
  Radio,
  RadioGroup,
  Row,
  Slider,
} from 'ant-design-vue'
import { mapActions, mapWritableState } from 'pinia'

import SidebarItem from '@/components/SidebarItem.vue'
import { useGeneSetStore } from '@/stores/geneSet'

export default {
  data: () => ({
    testValue: 50,
  }),
  components: {
    AButton: Button,
    SidebarItem,
    ASlider: Slider,
    AForm: Form,
    AFormItem: FormItem,
    ARadioGroup: RadioGroup,
    ARadio: Radio,
    ARow: Row,
    ACol: Col,
  },
  methods: {
    ...mapActions(useGeneSetStore, ['changeSorting', 'updateSimulation', 'resetParameters']),
  },
  computed: {
    ...mapWritableState(useGeneSetStore, [
      'scaleContraction',
      'scaleRepulsion',
      'scaleXForce',
      'scaleYForce',
      'minimumDistance',
    ]),
  },
}
</script>

<template>
  <SidebarItem title="Spring Settings">
    <AForm
      layout="horizontal"
      :labelCol="{ span: 8 }"
      :wrapperCol="{ span: 16 }"
      class="view-options"
    >
      <AFormItem label="Group alignment">
        <ASlider id="homology" v-model:value="scaleYForce" :min=0 :max=100> </ASlider>
      </AFormItem>
      <AFormItem label="Separation">
        <ASlider id="distance" v-model:value="minimumDistance"  :min=2 :max=10000> </ASlider>
      </AFormItem>
      <AFormItem label="Sequence stiffness">
        <ASlider id="x-force" v-model:value="scaleXForce" type="range" :min=0 :max=100> </ASlider>
      </AFormItem>
      <AFormItem label="Evenness">
        <ASlider id="contractive" v-model:value="scaleContraction"  :min=0 :max=100> </ASlider>
      </AFormItem>
    </AForm>
    <AForm class="cluster-options">
      <AFormItem>
        <ARow type="flex">
          <ACol :span="8"> </ACol>
          <ACol :span="25">
            <ARow type="flex" :gutter="12">
              <ACol :span="12">
                <AButton type="primary" ghost @click="updateSimulation()">
                  Rerun simulation
                </AButton>
              </ACol>
              <ACol :span="8">
                <AButton type="primary" danger ghost @click="resetParameters();updateSimulation()">
                  Reset parameters
                </AButton>
              </ACol>
            </ARow>
          </ACol>
        </ARow>
      </AFormItem>
    </AForm>
  </SidebarItem>
</template>

<style lang="scss">
.cluster-options {
  .ant-form-item {
    margin-top: 24px !important;
  }
  .ant-form-item {
    margin-bottom: 8px !important;
  }
}
</style>

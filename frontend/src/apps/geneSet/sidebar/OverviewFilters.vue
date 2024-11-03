<template>
  <SidebarItem title="Filters Overview">
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
import { mapWritableState } from 'pinia'
import { computed, defineComponent } from 'vue'

import SidebarItem from '@/components/SidebarItem.vue'
import { useGenomeStore } from '@/stores/geneSet'

export default defineComponent({
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
})
</script>

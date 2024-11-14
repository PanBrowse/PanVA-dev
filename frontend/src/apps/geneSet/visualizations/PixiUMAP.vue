<template>
  <ACard
    title="UMAP Embedding"
    :style="{ width: '100%', height: '100%' }"
    :bordered="false"
    size="small"
  >
    <template #extra>
      <AButton type="text" size="small">
        <CloseCircleOutlined key="edit" />
      </AButton>
    </template>
    <div class="child-container" ref="view">
      <canvas ref="pixi"></canvas>
      <svg ref="lasso"><g class="lasso"></g></svg>
    </div>
  </ACard>
</template>

<script lang="ts">
import { CloseCircleOutlined } from '@ant-design/icons-vue'
import { Button, Card } from 'ant-design-vue'
import * as PIXI from 'pixi.js'
import { UMAP } from 'umap-js'
import { DistanceFn } from 'umap-js/dist/umap'
import { defineComponent } from 'vue'

import { useGenomeStore } from '@/stores/geneSet'

export function customDistance(a, b) {
  //   debugger
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export default defineComponent({
  name: 'PixiUMAP',
  emits: ['loaded'], // Declare the emitted event
  components: {
    ACard: Card,
    AButton: Button,
    CloseCircleOutlined,
  },
  props: {
    distanceMatrix: {
      type: Array,
      required: true,
    },
    // embedding: {
    //   type: Array,
    //   required: true,
    // },
  },
  data() {
    return {
      app: null as PIXI.Application | null,
      circleTexture: null as PIXI.Texture | null,
    }
  },
  setup() {
    const genomeStore = useGenomeStore()
    // const selectedGeneUids = ref<string[]>([])

    // // Fetch default selection on mount if it's already set in the store
    // onMounted(() => {
    //   if (genomeStore.selectedSequencesLasso.length) {
    //     updateSelectedGeneUids()
    //   }
    // })

    // // Helper function to update selected genes based on `selectedSequencesLasso`
    // const updateSelectedGeneUids = async () => {
    //   const geneUids = await genomeStore.getGenesForSelectedLasso()
    //   console.log('Updated selectedGeneUids:', geneUids)
    //   genomeStore.setSelectedGeneUids(geneUids) // set store value
    //   selectedGeneUids.value = geneUids // set local value
    // }

    // // Watcher to react to changes in selectedSequencesLasso
    // watch(
    //   () => genomeStore.selectedSequencesLasso,
    //   async (_newLassoSelection) => {
    //     console.log(
    //       'lasso selection from watch pixi scatter',
    //       _newLassoSelection
    //     )
    //     await updateSelectedGeneUids()
    //   },
    //   { immediate: true }
    // )

    return {
      //   selectedGeneUids,
      genomeStore,
    }
  },
  mounted() {
    this.$nextTick(async () => {
      try {
        const genomeStore = this.genomeStore

        // // Create a PIXI.Application instance
        const app = new PIXI.Application()
        this.app = app

        // Initialize the application
        await app.init({
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: 0xffffff,
          // resolution: window.devicePixelRatio || 1,
          antialias: true,
          canvas: this.$refs.pixi,
          resizeTo: this.$refs.view, // or window
        })

        // Check and log canvas size
        const canvas = app.canvas
        console.log('Initial Canvas Size:', canvas.width, 'x', canvas.height)

        const test_data = Array.from({ length: 25 }, (_, x) =>
          Array.from({ length: 25 }, (_, y) => ({ x, y }))
        ).flat()
        console.log('test_data', test_data)

        // Set the canvas size dynamically
        this.resizeWindow(app)

        const devicePixelRatio = window.devicePixelRatio || 1
        console.log('devicePixelRatio', devicePixelRatio)
        const padding = 10

        const umap = new UMAP({
          nComponents: 2,
          nNeighbors: 3,
          learningRate: 1.0, // Explicitly set learning rate
          minDist: 0.1,
          distanceFn: customDistance,
        })
        const embedding = umap.fit(test_data)
        console.log('embedding', embedding)

        const circleRadius = 5 * devicePixelRatio
        this.createCircleTexture(circleRadius, app)

        const container = new PIXI.Container()

        const canvasWidth = canvas.width
        console.log('canvasWidth', canvasWidth)
        const canvasHeight = canvas.height
        console.log('canvasHeight', canvasHeight)

        // Calculate the min and max values for x and y in the embedding
        const xValues = embedding.map(([x]) => x)
        const yValues = embedding.map(([, y]) => y)
        const minX = Math.min(...xValues)
        const maxX = Math.max(...xValues)
        const minY = Math.min(...yValues)
        const maxY = Math.max(...yValues)

        // Calculate scaling factors based on the canvas size, accounting for padding
        const scaleX = (canvasWidth - 10 * padding) / (maxX - minX)
        const scaleY = (canvasHeight - 10 * padding) / (maxY - minY)
        const scale = Math.min(scaleX, scaleY) // Use the smaller scale to maintain aspect ratio

        embedding.forEach(([x, y], index) => {
          console.log('x', x, 'y', y)
          // Scale x and y based on the range of coordinates in the embedding
          //   const scaledX =
          //     (x - Math.min(...this.embedding.map(([x]) => x))) *
          //     20 *
          //     devicePixelRatio
          //   const scaledY =
          //     (y - Math.min(...this.embedding.map(([, y]) => y))) *
          //     20 *
          //     devicePixelRatio
          const scaledX = (x - minX) * scale + padding
          const scaledY = (y - minY) * scale + padding

          console.log('scaledX', scaledX, 'scaledY', scaledY)
          this.createSprites(scaledX, scaledY, index, container)
        })

        app.stage.addChild(container)

        app.render()

        // Handle window resizing
        window.addEventListener('resize', () => {
          this.resizeWindow(app)
          //   app.renderer.resize(window.innerWidth, window.innerHeight)
        })

        // to-do: fix this workaround
        // Emit the loaded event after everything is set up

        console.log('PixiUMAP loaded event emitted')
        this.$emit('loaded')
      } catch (error) {
        console.error('Error initializing Pixi.js:', error)
      }
    })
  },
  methods: {
    createCircleTexture(circleRadius, app) {
      // Use PIXI.Graphics to draw a circle
      const graphics = new PIXI.Graphics()
      // Draw border
      const borderRadius = circleRadius + 0.5 * devicePixelRatio
      const totalRadius =
        borderRadius > circleRadius ? borderRadius : circleRadius
      const borderColor = 0x000000
      graphics.circle(totalRadius, totalRadius, borderRadius)
      graphics.fill(borderColor)
      // Draw the circle
      graphics.circle(totalRadius, totalRadius, circleRadius)
      graphics.fill(0xffffff)
      // Generate a texture from the Graphics object
      this.circleTexture = app.renderer.generateTexture(graphics)
    },
    // createSprites(
    //   x: number,
    //   y: number,
    //   index: number,
    //   container: PIXI.Container
    // ) {
    //   if (!this.circleTexture) {
    //     console.error('Circle texture is not created.')
    //     return
    //   }

    //   const sprite = new PIXI.Sprite(this.circleTexture)
    //   sprite.x = x
    //   sprite.y = y
    //   sprite.anchor.set(0.5) // Center the circle texture on (x, y)
    //   container.addChild(sprite)
    // },
    createSprites(x: number, y: number, index: number, circleContainer) {
      if (!this.circleTexture) {
        console.error('Circle texture is not created.')
        return
      }

      // Create a sprite using the circle texture
      const circleSprite = new PIXI.Sprite(this.circleTexture)

      circleSprite.tint = 0xd3d3d3
      circleSprite.alpha = 0.5 // Set opacity to 50%

      // Check if this sequence is part of the selectedSequencesLasso
      //   const isSelected =
      //     this.genomeStore.selectedSequencesLasso.includes(sequence_uid)
      //   circleSprite.tint = isSelected ? 0x007bff : 0xd3d3d3 // Blue if selected, gray otherwise

      circleSprite.index = index

      // Add interactivity to the sprite
      circleSprite.interactive = true
      circleSprite.buttonMode = true

      circleSprite.x = x
      circleSprite.y = y

      circleContainer.addChild(circleSprite)
    },
    resizeWindow(app) {
      const devicePixelRatio = window.devicePixelRatio || 1
      const parentWidth = this.$el.parentElement.clientWidth
      const parentHeight = this.$el.parentElement.clientHeight
      console.log(`${parentWidth} x ${parentHeight}`)
      console.log(`devicePixelRatio ${devicePixelRatio}`)

      const canvasWidth = parentWidth * devicePixelRatio
      const canvasHeight = parentHeight * devicePixelRatio

      app.renderer.resize(canvasWidth, canvasHeight)
      console.log(`canvas resize ${canvasWidth} x ${canvasHeight}`)
      const canvas = app.canvas
      canvas.style.width = `${parentWidth}px`
      canvas.style.height = `${parentHeight}px`

      const svgElement = this.$refs.lasso
      svgElement.setAttribute('width', canvasWidth)
      svgElement.setAttribute('height', canvasHeight)
      svgElement.style.width = `${parentWidth}px`
      svgElement.style.height = `${parentHeight}px`

      console.log('final width canvas after resize: ', canvas.width)

      // // Access the parent element of this component's root element
      // const parentElement = this.$el.parentElement
      // const canvas = app.canvas
      // const parentDiv = this.$refs.view
      // const svgElement = this.$refs.lasso
      // const devicePixelRatio = window.devicePixelRatio || 1

      // // Check if parentElement exists, then log its width
      // if (parentElement) {
      //   const parentWidth = this.$el.parentElement.clientWidth
      //   const parentHeight = this.$el.parentElement.clientHeight
      //   console.log(
      //     `Parent width:  ${parentWidth}, Parent height: ${parentHeight}`
      //   )

      //   console.log(`devicePixelRatio: ${devicePixelRatio}`)

      //   // Set canvas size based on devicePixelRatio
      //   const canvasWidth = parentWidth / devicePixelRatio
      //   const canvasHeight = parentHeight / devicePixelRatio

      //   // Canvas resize
      //   app.renderer.resize(canvasWidth, canvasHeight)
      //   canvas.style.width = `${parentWidth}px`
      //   canvas.style.height = `${parentHeight}px`

      //   console.log('Canvas resized to:', parentWidth, 'x', parentHeight)

      //   // svg resize
      //   svgElement.setAttribute('width', parentWidth)
      //   svgElement.setAttribute('height', parentHeight)
      //   svgElement.style.width = `${parentWidth}px`
      //   svgElement.style.height = `${parentWidth}px`
      //   // svgElement.setAttribute('preserveAspectRatio', 'none')

      //   // Debug: Log both the attribute and inline style values
      //   console.log(
      //     `SVG Attributes - width: ${svgElement.getAttribute(
      //       'width'
      //     )}, height: ${svgElement.getAttribute('height')}`
      //   )
      //   console.log(
      //     `SVG Styles - width: ${svgElement.style.width}, height: ${svgElement.style.height}`
      //   )
      // }
    },
  },
  beforeUnmount() {
    if (this.app) {
      this.app.destroy(true, {
        children: true,
        texture: true,
        baseTexture: true,
      })
      this.app = null
    }
  },
})
</script>

<style scoped>
.child-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}
</style>

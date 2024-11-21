<template>
  <ACard
    title="UMAP Embedding"
    :style="{ width: '100%', height: '100%'}"
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
      <svg ref="lasso_umap"><g class="lasso"></g></svg>
    </div>
  </ACard>
</template>

<script lang="ts">
import { CloseCircleOutlined } from '@ant-design/icons-vue'
import { Button, Card } from 'ant-design-vue'
import * as d3 from 'd3'
import * as PIXI from 'pixi.js'
import seedrandom from 'seedrandom'
import { UMAP } from 'umap-js'
import { DistanceFn } from 'umap-js/dist/umap'
import { defineComponent, onMounted, ref, watch } from 'vue'

import { lasso } from '@/components/Lasso.js'
import { useGenomeStore } from '@/stores/geneSet'

// PIXI.Sprite.prototype.getBoundingClientRect = function () {

//   return {
//     left: (this.x - this.width /2) /2,
//     top: (this.y - this.height /2) /2,
//     width: this.width,
//     height: this.height,
//   }
// }

PIXI.Sprite.prototype.getBoundingClientRect = function () {
  const devicePixelRatio = window.devicePixelRatio || 1

  const adjustedWidth = devicePixelRatio > 1 ? this.width : this.width * 2
  const adjustedHeight = devicePixelRatio > 1 ? this.height : this.height * 2

  return {
    left: (this.x - this.width) / devicePixelRatio,
    top: (this.y - this.height) / devicePixelRatio,
    width: adjustedWidth,
    height: adjustedHeight,
  }
}
// export function customDistance(a, b) {
//   //   to compute protein distance:
//   // arguments: a, b, mrna_prot_sim_matrix, seq_to_mrna_lookup
//   const genomeStore = useGenomeStore()
//   const lookup = genomeStore.sequenceToMrnaLookup
//   const mrna_matrix = genomeStore.mrnaScoreMatrix
//   const mrna_indices = genomeStore.mrnaUidIndexLookup

//   // for the pair of sequences, find their mrnas and retrieve the average score
//   console.log(
//     'Math.abs(a.x - b.x) + Math.abs(a.y - b.y)',
//     Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
//   )

//   return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
//}

// export function computeSequenceDistance(a, b) {
//   const genomeStore = useGenomeStore()

//   const mrnaUids1 = genomeStore.sequenceToMrnaLookup[a.uid] || []
//   const mrnaUids2 = genomeStore.sequenceToMrnaLookup[b.uid] || []

//   // If either sequence has no associated mRNAs, return 0
//   if (mrnaUids1.length === 0 || mrnaUids2.length === 0) {
//     return 1
//   }

//   if (mrnaUids1.length > 0 || mrnaUids2.length > 0) {
//     console.log('mrnaUids1', mrnaUids1, 'mrnaUids2', mrnaUids1)
//   }

//   let totalIdentity = 0

//   // Calculate total identity score for all mRNA pairs
//   mrnaUids1.forEach((mrnaUid1) => {
//     mrnaUids2.forEach((mrnaUid2) => {
//       const index1 = genomeStore.mrnaUidIndexLookup[mrnaUid1]
//       //   console.log('index1', index1)

//       const index2 = genomeStore.mrnaUidIndexLookup[mrnaUid2]
//       //   console.log('index2', index2)

//       //   console.log('distanceMatrix', genomeStore.distanceMatrix)

//       //   console.log('mrnaMatrix', genomeStore.mrnaScoreMatrix)

//       // Ensure both indices exist in the score matrix
//       if (index1 !== undefined && index2 !== undefined) {
//         totalIdentity += genomeStore.mrnaScoreMatrix[index1][index2]
//       }
//     })
//   })

//   // Calculate the normalization factor
//   const mrnaProduct = mrnaUids1.length * mrnaUids2.length

//   // If the product is 0 (shouldn't happen), return 0
//   if (mrnaProduct === 0) {
//     return 0
//   }
//   // Return the normalized similarity score
//   const similarity = totalIdentity / mrnaProduct

//   // Convert similarity to distance
//   const distance = 1 - similarity

//   console.log('distance between', a.uid, b.uid, distance)

//   return distance
// }

export function computeSequenceDistance(a, b) {
  const genomeStore = useGenomeStore()

  const index1 = genomeStore.genomeData.sequences.findIndex(
    (obj) => obj.uid === a.uid
  )

  const index2 = genomeStore.genomeData.sequences.findIndex(
    (obj) => obj.uid === b.uid
  )

  var score = genomeStore.distanceMatrix[index1][index2]

  if (score < 1) {
    console.log(a.id, index1, b.id, index2, score)
  }

  return score
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
    embedding: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      app: null as PIXI.Application | null,
      circleTexture: null as PIXI.Texture | null,
      selectedSprites: [] as PIXI.Sprite[],
    }
  },
  setup(props) {
    const genomeStore = useGenomeStore()

    const selectedGeneUids = ref<string[]>([])

    // Fetch default selection on mount if it's already set in the store
    onMounted(() => {
      if (genomeStore.selectedSequencesLasso.length) {
        updateSelectedGeneUids()
      }
    })

    // Helper function to update selected genes based on `selectedSequencesLasso`
    const updateSelectedGeneUids = async () => {
      const geneUids = await genomeStore.getGenesForSelectedLasso()
      console.log('Updated selectedGeneUids:', geneUids)
      genomeStore.setSelectedGeneUids(geneUids) // set store value
      selectedGeneUids.value = geneUids // set local value
    }

    // Watcher to react to changes in selectedSequencesLasso
    watch(
      () => genomeStore.selectedSequencesLasso,
      async (_newLassoSelection) => {
        console.log('lasso selection from watch pixi UMAP', _newLassoSelection)
        await updateSelectedGeneUids()
      },
      { immediate: true }
    )

    return {
      selectedGeneUids,
      genomeStore,
    }
  },
  mounted() {
    this.$nextTick(async () => {
      try {
        const genomeStore = this.genomeStore

        //////////////// when using UMAP-js ///////////////////////////////
        // const seed = 42
        // const rng = seedrandom(seed.toString())

        // const umap = new UMAP({
        //   nComponents: 2,
        //   nNeighbors: 10,
        //   minDist: 0.1,
        //   random: rng,
        //   nEpochs: 500,
        //   learningRate: 1,
        //   distanceFn: computeSequenceDistance,
        //   //   distanceFn: customDistance, // test with protein similarity scores
        // })

        // const embedding = umap.fit(sequences) // here load the sequences

        // preloaded embedding
        const embedding = this.embedding
        console.log('embedding', embedding)

        // Create a PIXI.Application instance
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

        const foregroundContainer = new PIXI.Container()
        const circleContainer = new PIXI.Container({
          isRenderGroup: true, // Enable GPU-accelerated rendering
        })

        this.foregroundContainer = foregroundContainer
        this.circleContainer = circleContainer

        this.renderEmbedding(embedding)

         // Add watcher for selectedSequencesLasso
         this.$watch(
          () => this.genomeStore.selectedSequencesLasso,
          (newSelectedSequences) => {
            console.log('Lasso selection updated:', newSelectedSequences)

            if (circleContainer) {
              circleContainer.children.forEach((sprite: any) => {
                // Check if this sequence is part of the selectedSequencesLasso
              const isSelected = this.genomeStore.selectedSequencesLasso.includes(
                sprite.sequence_uid
              )
              sprite.tint = isSelected ? 0x007bff : 0xd3d3d3 // Blue if selected, gray otherwise
              })
          
            }
            this.app?.render() //rerender 
          },
          { immediate: true }
        )

        // Watch for embedding changes
        this.$watch(
          () => this.embedding,
          (newEmbedding) => {
            console.log('Embedding changed in PixiUMAP watcher:', newEmbedding)

            // genomeStore.selectedSequencesLasso = [];

            this.renderEmbedding(newEmbedding)
          },
          { immediate: true, deep: true }
        )

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
    renderEmbedding(embedding) {
      console.log('Rendering embedding:', embedding)

      //  // Clear lasso groups
      d3.select(this.$refs.lasso_umap).selectAll('g.lasso *').remove()

      // Clear previous content
      if (this.app) {
        this.app.stage.removeChildren()
      }

      // Clear previous content
      if (this.circleContainer) {
        this.circleContainer.removeChildren() // Clear all children from the container
      }

      this.app.stage.addChild(this.circleContainer)
      this.app.stage.addChild(this.foregroundContainer)

      // Check and log canvas size
      const canvas = this.app.canvas
      console.log('Initial Canvas Size:', canvas.width, 'x', canvas.height)

      // Set the canvas size dynamically
      this.resizeWindow(this.app)

      const devicePixelRatio = window.devicePixelRatio || 1
      console.log('devicePixelRatio', devicePixelRatio)
      const padding = 10

      const circleRadius = 5 * devicePixelRatio
      const app = this.app
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
        //   console.log('x', x, 'y', y)
        // Scale x and y based on the range of coordinates in the embedding
        //   const scaledX =
        //     (x - Math.min(...embedding.map(([x]) => x))) * 20 * devicePixelRatio
        //   const scaledY =
        //     (y - Math.min(...embedding.map(([, y]) => y))) *
        //     20 *
        //     devicePixelRatio
        const scaledX = (x - minX) * scale + padding
        const scaledY = (y - minY) * scale + padding

        this.createSprites(
          scaledX,
          scaledY,
          index,
          this.foregroundContainer,
          this.circleContainer
        )
      })

      this.app.stage.addChild(this.circleContainer)

      this.app.render()

      //  Reinitialize the lasso
      this.initializeLasso(canvas)

      console.log(this.lassoInstance.items())
    },
    initializeLasso(canvas) {
      // Ensure lasso SVG and elements are properly set up
      const svg = d3
        .select(this.$refs.lasso_umap)
        .attr('width', canvas.clientWidth)
        .attr('height', canvas.clientHeight)
        .style('position', 'absolute')
        .style('top', '0')
        .style('left', '0')
        .style('pointer-events', 'none') // Ensure Pixi.js captures pointer events

      // Set up the lasso instance
      this.lassoInstance = lasso()
        .targetArea(d3.select(canvas)) // Bind to the canvas
        .closePathDistance(150)
        .on('start', this.lassoStart)
        .on('draw', this.lassoDraw)
        .on('end', this.lassoEnd)

      // Link lasso to the sprites in the container
      this.lassoInstance.items(this.circleContainer.children as PIXI.Sprite[])
      svg.select('g.lasso').call(this.lassoInstance)

      // // Store lasso instance for further interaction
      // this.lassoInstance = lassoInstance;

      console.log('Lasso initialized and added.')
    },
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

    createReverseLookup(lookup) {
      const reverseLookup = {}

      for (const uid in lookup) {
        const index = lookup[uid]
        reverseLookup[index] = uid
      }

      return reverseLookup
    },
    createSprites(
      x: number,
      y: number,
      index: number,
      foregroundContainer,
      circleContainer
    ) {
      if (!this.circleTexture) {
        console.error('Circle texture is not created.')
        return
      }

      // Determine the labels based on filterEmpty
      const labels = this.genomeStore.filterEmpty
        ? this.createReverseLookup(
            this.genomeStore.distanceMatrixLabelsFiltered
          )
        : this.createReverseLookup(this.genomeStore.distanceMatrixLabels)

      // console.log('labels', labels)

      // Create a sprite using the circle texture
      const circleSprite = new PIXI.Sprite(this.circleTexture)

      circleSprite.tint = 0xd3d3d3
      circleSprite.alpha = 0.5 // Set opacity to 50%

      circleSprite.index = index
      circleSprite.sequence_uid = labels[index]

      // Check if this sequence is part of the selectedSequencesLasso
      const isSelected = this.genomeStore.selectedSequencesLasso.includes(
        labels[index]
      )
      circleSprite.tint = isSelected ? 0x007bff : 0xd3d3d3 // Blue if selected, gray otherwise
      // circleSprite.alpha = isSelected ? 1 : 0.5

      // Add interactivity to the sprite
      circleSprite.interactive = true
      circleSprite.buttonMode = true

      circleSprite.x = x
      circleSprite.y = y

      circleContainer.addChild(circleSprite)
    },
    lassoStart() {
      // const genomeStore = useGenomeStore()

      // const trackerUids = genomeStore.selectedSequencesTracker

      // // Filter the sprites in lassoInstance based on sequence_uids in tracker
      // const trackedSprites = this.lassoInstance.items().filter((sprite) => {
      //   return trackerUids.has(sprite.sequence_uid) // Check if sprite's UID is in the tracker
      // })

      // // Apply different tint to sprites in the tracker
      // trackedSprites.forEach((sprite) => {
      //   sprite.tint = 0xa9a9a9 // darker tint for previously selected sprites
      //   sprite.alpha = 0.5 // Set opacity to 50%
      // })
      // if (this.selectedSprites) {
      //   this.selectedSprites.forEach((sprite) => {
      //     if (!trackerUids.has(sprite.sequence_uid)) {
      //       sprite.tint = 0xd3d3d3 // default tint for unmatched sprites
      //       sprite.alpha = 0.5 // Set opacity to 50%
      //     }
      //   })
      // }

      this.lassoInstance.items().forEach((sprite) => {
        sprite.tint = 0xd3d3d3
      })
      this.app.render()
    },
    lassoDraw() {
      console.log('Lasso drawing')
    },
    lassoEnd() {
      const selectedSprites = []

      try {
        console.log('Lasso end')

        this.lassoInstance.items().forEach((sprite) => {
          if (sprite.__lasso.selected) {
            sprite.tint = 0x007bff
            selectedSprites.push(sprite.sequence_uid)
            // genomeStore.setSelectedSequencesTracker(sprite.sequence_uid)
          } else {
            sprite.tint = 0xd3d3d3
          }
        })

        this.app?.render()

        // const boolSprites = this.lassoInstance.items().map(x => x.__lasso.selected);
        // console.log('boolSprites', boolSprites)
        // const selectedSprites = this.lassoInstance.items().filter((sprite, index) => boolSprites[index] === true).map(
        // (sprite) => sprite.sequence_uid
        // );
        console.log('Selected sprites:', selectedSprites)
        this.selectedSprites = selectedSprites
        const genomeStore = useGenomeStore()
        genomeStore.setSelectedSequencesLasso(selectedSprites)

        this.lassoInstance.reset();
        // this.$forceUpdate();
      } catch (error) {
        console.error('Error in lassoEnd:', error)
      }
    },
    resizeWindow(app) {
      const devicePixelRatio = window.devicePixelRatio || 1
      const parentWidth = this.$el.parentElement.clientWidth - 24 // 2x padding card body
      const parentHeight = this.$el.parentElement.clientHeight - 41 - 24 // card head and padding 
      console.log(`${parentWidth} x ${parentHeight}`)
      console.log(`devicePixelRatio ${devicePixelRatio}`)

      const canvasWidth = parentWidth * devicePixelRatio
      const canvasHeight = parentHeight * devicePixelRatio

      app.renderer.resize(canvasWidth, canvasHeight)
      console.log(`canvas resize ${canvasWidth} x ${canvasHeight}`)
      const canvas = app.canvas
      canvas.style.width = `${parentWidth}px`
      canvas.style.height = `${parentHeight}px`

      const svgElement = this.$refs.lasso_umap
      svgElement.setAttribute('width', canvasWidth)
      svgElement.setAttribute('height', canvasHeight)
      svgElement.style.width = `${parentWidth}px`
      svgElement.style.height = `${parentHeight}px`

      console.log('final width canvas after resize: ', canvas.width)

      // // Access the parent element of this component's root element
      // const parentElement = this.$el.parentElement
      // const canvas = app.canvas
      // const parentDiv = this.$refs.view
      // const svgElement = this.$refs.lasso_umap
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

svg {
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

:deep(g.lasso path) {
  stroke: #007bff;
  stroke-width: 2px;
}
:deep(g.lasso .drawn) {
  fill: #007bff;
  fill-opacity: 0.2;
}
:deep(g.lasso .loop_close) {
  fill: none;
  stroke-dasharray: 4, 4;
}
:deep(g.lasso .origin) {
  fill: #007bff;
  fill-opacity: 0.5;
}

.selected {
  fill: orange; /* Highlight selected items in orange */
  stroke: darkorange;
  stroke-width: 2px;
}

.possible {
  fill: lightblue; /* Temporarily highlight items inside the lasso path */
  stroke: blue;
  stroke-width: 2px;
}

.not-selected {
  opacity: 0.3; /* Dim items that are not selected */
}
</style>

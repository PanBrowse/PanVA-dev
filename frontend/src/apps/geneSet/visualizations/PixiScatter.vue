<!-- <template>
  <div class="child-container" ref="view">
    <canvas ref="pixi"></canvas>
    <svg ref="lasso"><g class="lasso"></g></svg>
  </div>
</template> -->

<template>
  <ACard
    title="Overview"
    :style="{
      width: `${100}%`,
      height: `${100}%`,
    }"
    :bordered="false"
    size="small"
  >
    <template #extra
      ><AButton type="text" size="small"
        ><CloseCircleOutlined key="edit" /></AButton
    ></template>
    <div class="child-container" ref="view">
      <canvas ref="pixi"></canvas>
      <svg ref="lasso"><g class="lasso"></g></svg>
    </div>
  </ACard>
</template>

<script lang="ts">
import { CloseCircleOutlined } from '@ant-design/icons-vue'
import { Button, Card } from 'ant-design-vue'
import * as d3 from 'd3'
import { mapActions, mapState } from 'pinia'
import * as PIXI from 'pixi.js'
import { DropShadowFilter } from 'pixi-filters'
import { defineComponent, onMounted, ref, watch } from 'vue'

import { lasso } from '@/components/Lasso.js'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGenomeStore } from '@/stores/geneSet'
import type { Gene, Genome, GenomeData } from '@/types'

PIXI.Sprite.prototype.getBoundingClientRect = function () {
  return {
    left: this.x - this.width / 2,
    top: this.y - this.height / 2,
    width: this.width,
    height: this.height,
  }
}

export default {
  name: 'PixiCanvas',
  emits: ['loaded'], // Declare the emitted event
  components: {
    ACard: Card,
    AButton: Button,
    CloseCircleOutlined: CloseCircleOutlined,
  },
  data: () => ({
    padding: {
      cardBody: 12,
    },
    cardHeaderHeight: 40,
  }),
  setup() {
    const genomeStore = useGenomeStore()
    const selectedGenes = ref<Gene[]>([])

    // Fetch default selection on mount if it's already set in the store
    onMounted(() => {
      if (genomeStore.selectedSequencesLasso.length) {
        updateSelectedGenes()
      }
    })

    // Helper function to update selected genes based on `selectedSequencesLasso`
    const updateSelectedGenes = async () => {
      selectedGenes.value = await genomeStore.getGenesForSelectedLasso()
      console.log('Updated selectedGenes:', selectedGenes.value)
    }

    // Watcher to react to changes in selectedSequencesLasso
    watch(
      () => genomeStore.selectedSequencesLasso,
      async (_newLassoSelection) => {
        console.log(
          'lasso selection from watch pixi scatter',
          _newLassoSelection
        )
        // selectedGenes.value = await genomeStore.getGenesForSelectedLasso()
        // console.log('Updated selectedGenes:', selectedGenes.value)
        await updateSelectedGenes()
      },
      { immediate: true } // Run immediately on component load
    )

    return {
      selectedGenes,
      genomeStore,
    }
  },
  computed: {
    ...mapState(useGeneSetStore, [
      'sortedChromosomeSequenceIndices',
      'sortedGroupInfoLookup',
      'groupInfoLookup',
      'sequenceIdLookup',
      'sortedMrnaIndices',
      'chromosomes',
      'numberOfChromosomes',
      'homologyGroups',
      'overviewArrows',
      'chrFocus',
      'showNotificationsOverview',
      'sequences',
      // 'percentageGC',
    ]),
    // ...mapState(useGenomeStore, ['genomes', 'sequences']),
  },
  mounted() {
    this.$nextTick(async () => {
      try {
        const genomeStore = this.genomeStore
        // const genomeStore = useGenomeStore()
        // console.log(
        //   'sequences from genomeStore: ',
        //   genomeStore.genomeData.genomes
        // )

        // // Create a PIXI.Application instance
        const app = new PIXI.Application()
        this.app = app

        // to-do:
        // - use auto detect renderer instead of graphics object
        // - resize listener when menu collapses
        // - calculate grid and radius based on availabe screen space

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

        // Set the canvas size dynamically
        this.resizeWindow(app)

        // Create a foreground container for hover texts
        const foregroundContainer = new PIXI.Container()
        const circleContainer = new PIXI.Container()

        // Add the foreground container to the stage last
        app.stage.addChild(foregroundContainer)
        app.stage.addChild(circleContainer)

        const devicePixelRatio = window.devicePixelRatio || 1
        console.log('devicePixelRatio', devicePixelRatio)
        const padding = 10
        const circleRadius = 5 * devicePixelRatio
        const circleSpacing = (3 * circleRadius) / devicePixelRatio
        const chromPadding = 25 // Padding between chromosome grids

        const containerWidth = this.$refs.pixi.clientWidth * devicePixelRatio
        const containerHeight = this.$refs.pixi.clientHeight * devicePixelRatio
        console.log('containerWidth', containerWidth)
        console.log('containerHeight', containerHeight)

        // load data
        const genomes = genomeStore.genomeData.genomes

        let numCols = Math.floor(
          (containerWidth - 2 * padding) /
            (2 * circleRadius + 2 * circleSpacing)
        )
        numCols = Math.floor(numCols / 5) * 5 // Make numCols a multiple of 5
        // console.log('numCols', numCols, this.sequences.length)
        console.log('numCols', numCols)

        // Calculate the number of rows needed to fit all the points
        // const numRows = Math.ceil(this.sequences.length / numCols)
        const numRows = Math.ceil(genomes.length / numCols)
        console.log('numRows', numRows)

        // Calculate the total grid width and height
        const totalGridWidth =
          numCols * (2 * circleSpacing + 2 * circleRadius) + 2 * padding
        const totalGridHeight =
          numRows * (2 * circleSpacing + 2 * circleRadius) + 2 * padding
        console.log('totalGridWidth', totalGridWidth)
        console.log('totalGridHeight', totalGridHeight)

        // test with old potato data
        // console.log('sequences', this.sequences)
        // const sequences_sorted = this.sequences.sort(
        //   (a, b) => b.sequence_length - a.sequence_length
        // )
        // console.log('sequences sorted', sequences_sorted)

        // const sequencesGrouped =
        //   this.groupSequencesByChromosome(sequences_sorted)
        // console.log('sequencesGrouped', sequencesGrouped)

        // <---------------------Create circle sprites ---------------->
        this.createCircleTexture(circleRadius, app)

        let currentXOffset = padding

        // Loop through each genome and create a unit grid for its sequences
        Object.entries(genomes).forEach(([_, genomeData]) => {
          const sequences = genomeData.sequences

          if (Array.isArray(sequences)) {
            let numCols = Math.ceil(sequences.length / 10) // max 10 rows

            sequences.forEach((sequence, index) => {
              const row = index % 10
              const col = Math.floor(index / 10)

              const x =
                (currentXOffset + col * circleSpacing + circleRadius) *
                devicePixelRatio
              const y =
                (padding + row * circleSpacing + circleRadius) *
                devicePixelRatio

              this.createSprites(
                x,
                y,
                genomeData.name,
                sequence.sequence_length_nuc,
                sequence.name,
                sequence.id,
                app,
                foregroundContainer,
                circleContainer,
                sequence.uid
              )
            })

            // After placing the grid for this chromosome, move the horizontal offset
            currentXOffset += numCols * circleSpacing + chromPadding
          } else {
            console.warn(
              `Expected sequences to be an array for genome ${genomeData.name}, but got:`,
              sequences
            )
          }
        })
        app.render()

        // --- Lasso Setup ---
        const svg = d3
          .select(this.$refs.lasso)
          .attr('width', this.$el.parentElement.clientWidth)
          .attr('height', this.$el.parentElement.clientHeigh)
          .style('position', 'absolute')
          .style('top', '0')
          .style('left', '0')
          .style('pointer-events', 'none') // Ensure Pixi.js captures pointer events

        // Lasso initialization
        const lassoInstance = lasso()
          .targetArea(d3.select(canvas)) // canvas as HTMLCanvasElement
          .closePathDistance(150)
          .on('start', this.lassoStart)
          .on('draw', this.lassoDraw)
          .on('end', this.lassoEnd)

        // // Attach lasso to Pixi.js objects
        lassoInstance.items(circleContainer.children)
        // console.log('cicrleContainer.children', circleContainer.children)

        this.lassoInstance = lassoInstance

        // // Call lasso on SVG container
        svg.select('g.lasso').call(lassoInstance) // d3 code

        app.stage.addChild(foregroundContainer)

        // Handle window resizing
        window.addEventListener('resize', () => {
          this.resizeWindow(app)
          //   app.renderer.resize(window.innerWidth, window.innerHeight)
        })

        // to-do: fix this workaround
        // Emit the loaded event after everything is set up

        console.log('PixiScatter loaded event emitted')
        this.$emit('loaded')
      } catch (error) {
        console.error('Error initializing Pixi.js:', error)
      }
    })
  },
  methods: {
    lassoStart() {
      console.log('Lasso selection started')
      const genomeStore = useGenomeStore()
      const trackerUids = genomeStore.selectedSequencesTracker

      // Filter the sprites in lassoInstance based on sequence_uids in tracker
      const trackedSprites = this.lassoInstance.items().filter((sprite) => {
        return trackerUids.has(sprite.sequence_uid) // Check if sprite's UID is in the tracker
      })

      // Apply different tint to sprites in the tracker
      trackedSprites.forEach((sprite) => {
        sprite.tint = 0xa9a9a9 // darker tint for previously selected sprites
      })
      if (this.selectedSprites) {
        this.selectedSprites.forEach((sprite) => {
          if (!trackerUids.has(sprite.sequence_uid)) {
            sprite.tint = 0xd3d3d3 // default tint for unmatched sprites
          }
        })
      }
    },
    lassoDraw() {},
    lassoEnd() {
      console.log('lasso end')

      // add the drawn path for the lasso
      const dyn_path = d3
        .select(this.$refs.lasso)
        .select('g.lasso')
        .select('g.lasso')
        .select('path.drawn')

      // add a closed path
      const close_path = d3
        .select(this.$refs.lasso)
        .select('g.lasso')
        .select('g.lasso')
        .select('path.loop_close')

      // add an origin node
      const origin_node = d3
        .select(this.$refs.lasso)
        .select('g.lasso')
        .select('g.lasso')
        .select('circle.origin')

      const lassoPath = dyn_path.attr('d') // Get the current lasso path
      // console.log('Lasso path data at end:', lassoPath)

      if (!lassoPath || lassoPath.length < 3) {
        // console.warn('Lasso selection is empty or too small.')
        return // Exit early
      }

      const polygonPoints = this.getPolygonFromPath(dyn_path.node())

      // Log the points to the console
      console.log('Polygon Points:', polygonPoints)
      const selectedSprites = this.lassoInstance.items().filter((sprite) => {
        const { x, y } = sprite.position
        // console.log('{ x, y } ', { x, y })
        return this.isPointInPolygon(x, y, polygonPoints) // Check if sprite is inside the lasso polygon
      })

      setTimeout(() => {
        dyn_path.attr('d', null) // Clear the lasso path after a delay if needed
        close_path.attr('d', null) // Clear the close path after a delay if needed
      }, 1000) // Adjust the delay as needed (e.g., 2000 ms = 2 seconds)
      origin_node.attr('display', 'none')

      console.log('Lasso path cleared in drawEnd.')

      // Apply effects to selected sprites
      selectedSprites.forEach((sprite) => {
        sprite.tint = 0x007bff // Set sprite color to blue
      })

      console.log('Selected sprites:', selectedSprites)
      this.selectedSprites = selectedSprites
      // Flattening the array and extracting UIDs
      const flattenedSequenceUids = selectedSprites
        .flat()
        .map((sprite) => sprite.sequence_uid)

      console.log(flattenedSequenceUids)

      const genomeStore = useGenomeStore() // Create an instance of the store
      // Save UIDs to the store
      genomeStore.setSelectedSequencesLasso(flattenedSequenceUids)
      // console.log(
      //   'Updated store with current lasso selection:',
      //   genomeStore.selectedSequencesLasso
      // )

      genomeStore.setSelectedSequencesTracker(flattenedSequenceUids)
      // console.log(
      //   'Updated store lasso selection tracker:',
      //   genomeStore.selectedSequencesTracker
      // )

      this.$forceUpdate() // might not need this?
    },
    getPolygonFromPath(pathElement) {
      const pathLength = pathElement.getTotalLength()
      const numPoints = 1000
      const points = []

      for (let i = 0; i <= numPoints; i++) {
        const point = pathElement.getPointAtLength((i / numPoints) * pathLength)
        points.push([point.x, point.y])
      }

      return points
    },
    isPointInPolygon(x, y, polygon) {
      const dpr = window.devicePixelRatio || 1
      x /= dpr
      y /= dpr
      let inside = false

      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0],
          yi = polygon[i][1]
        const xj = polygon[j][0],
          yj = polygon[j][1]
        const intersect =
          yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
        if (intersect) inside = !inside
      }
      return inside
    },
    createCircleTexture(circleRadius, app) {
      // Use PIXI.Graphics to draw a circle
      const graphics = new PIXI.Graphics()
      // Draw the circle
      graphics.circle(circleRadius, circleRadius, circleRadius)
      graphics.fill(0xffffff)
      // Generate a texture from the Graphics object
      this.circleTexture = app.renderer.generateTexture(graphics)
    },
    createSprites(
      x,
      y,
      genome_name,
      sequence_length,
      sequence_name,
      sequence_id,
      app,
      foregroundContainer,
      circleContainer,
      sequence_uid
    ) {
      if (!this.circleTexture) {
        console.error('Circle texture is not created.')
        return
      }

      // Create a sprite using the circle texture
      const circleSprite = new PIXI.Sprite(this.circleTexture)
      circleSprite.x = x
      circleSprite.y = y
      circleSprite.tint = 0xd3d3d3

      circleSprite.sequence_uid = sequence_uid

      // Add interactivity to the sprite
      circleSprite.interactive = true
      circleSprite.buttonMode = true

      const hoverTextGenomeLabel = new PIXI.Text({
        text: 'genome nr: ',
        style: {
          fontSize: 12 * devicePixelRatio,
          fill: 0xffffff,
          fontWeight: 'bold',
          align: 'left',
          resolution: window.devicePixelRatio || 1,
        },
      })
      hoverTextGenomeLabel.visible = false // Hidden initially

      const hoverTextGenomeValue = new PIXI.Text({
        text: `${sequence_id}`,
        style: {
          fontSize: 12 * devicePixelRatio,
          fill: 0xffffff,
          align: 'left',
          resolution: window.devicePixelRatio || 1,
        },
      })
      hoverTextGenomeValue.visible = false

      const hoverTextSeqNameLabel = new PIXI.Text({
        text: 'sequence: ',
        style: {
          fontSize: 12 * devicePixelRatio,
          fill: 0xffffff,
          fontWeight: 'bold',
          align: 'left',
          resolution: window.devicePixelRatio || 1,
        },
      })
      hoverTextSeqNameLabel.visible = false // Hidden initially

      const hoverTextSeqNameValue = new PIXI.Text({
        text: `${sequence_name}`,
        style: {
          fontSize: 12 * devicePixelRatio,
          fill: 0xffffff,
          align: 'left',
          resolution: window.devicePixelRatio || 1,
        },
      })
      hoverTextSeqNameValue.visible = false

      const hoverTextSeqLengthLabel = new PIXI.Text({
        text: 'length: ',
        style: {
          fontSize: 12 * devicePixelRatio,
          fill: 0xffffff,
          fontWeight: 'bold',
          align: 'left',
          resolution: window.devicePixelRatio || 1,
        },
      })
      hoverTextSeqLengthLabel.visible = false // Hidden initially

      const hoverTextSeqLengthValue = new PIXI.Text({
        text: `${
          sequence_length > 100000
            ? (sequence_length / 1000000).toFixed(2) + ' Mb'
            : (sequence_length / 1000).toFixed(2) + ' Kb'
        }`,
        style: {
          fontSize: 12 * devicePixelRatio,
          fill: 0xffffff,
          align: 'left',
          resolution: window.devicePixelRatio || 1,
        },
      })
      hoverTextSeqLengthValue.visible = false

      // // // Create a PIXI.Text object to show the hover text (hidden by default)
      // const hoverText = new PIXI.Text({
      //   text: `genome nr: ${genome_name}\n name: ${sequence_name}\nlength: ${
      //     sequence_length > 100000
      //       ? (sequence_length / 1000000).toFixed(2) + ' Mb'
      //       : (sequence_length / 1000).toFixed(2) + ' Kb'
      //   }`,
      //   style: {
      //     fontSize: 12 * devicePixelRatio,
      //     fill: 0xffffff,
      //     align: 'left',
      //     resolution: window.devicePixelRatio || 1,
      //   },
      // })
      // hoverText.visible = false // Hidden initially

      // Set positions for each text object
      const hoverTextPadding = 5 // Vertical padding between text lines
      hoverTextGenomeLabel.position.set(
        circleSprite.x + 20,
        circleSprite.y + 20
      )
      hoverTextGenomeValue.position.set(
        hoverTextGenomeLabel.x + hoverTextGenomeLabel.width,
        hoverTextGenomeLabel.y
      )

      hoverTextSeqLengthLabel.position.set(
        circleSprite.x + 20,
        hoverTextGenomeLabel.y + hoverTextGenomeLabel.height + hoverTextPadding
      )
      hoverTextSeqLengthValue.position.set(
        hoverTextSeqLengthLabel.x + hoverTextSeqLengthLabel.width,
        hoverTextSeqLengthLabel.y
      )

      hoverTextSeqNameLabel.position.set(
        circleSprite.x + 20,
        hoverTextSeqLengthLabel.y +
          hoverTextSeqLengthLabel.height +
          hoverTextPadding
      )
      hoverTextSeqNameValue.position.set(
        hoverTextSeqNameLabel.x + hoverTextSeqNameLabel.width,
        hoverTextSeqNameLabel.y
      )

      const textBackground = new PIXI.Graphics()

      // Calculate the tooltip width and height
      const tooltipWidth =
        Math.max(
          hoverTextGenomeLabel.width + hoverTextGenomeValue.width,
          hoverTextSeqNameLabel.width + hoverTextSeqNameValue.width,
          hoverTextSeqLengthLabel.width + hoverTextSeqLengthValue.width
        ) + 20
      const tooltipHeight =
        hoverTextGenomeLabel.height +
        hoverTextGenomeValue.height +
        hoverTextSeqNameLabel.height +
        hoverTextSeqNameValue.height +
        hoverTextSeqLengthLabel.height +
        hoverTextSeqLengthValue.height
      // Draw the background rectangle
      textBackground.rect(
        circleSprite.x + 10, // Positioning the rectangle
        circleSprite.y + 10, // Positioning below the sprite
        tooltipWidth,
        tooltipHeight
      )
      textBackground.fill({ color: 0x000000, alpha: 0.8 }) // Semi-transparent black background

      // to-do make
      const shadowFilter = new DropShadowFilter({
        color: 0x64646f, // Shadow color
        alpha: 0.3, // Shadow opacity
        blur: 5, // Shadow blur radius
        distance: 5, // Shadow distance from tooltip
        rotation: 90, // Shadow angle
      })
      textBackground.filters = [shadowFilter]

      textBackground.visible = false // Hidden initially

      // Add the text objects and background to the foreground container
      foregroundContainer.addChild(textBackground)
      foregroundContainer.addChild(hoverTextGenomeLabel)
      foregroundContainer.addChild(hoverTextSeqLengthLabel)
      foregroundContainer.addChild(hoverTextSeqLengthValue)
      foregroundContainer.addChild(hoverTextGenomeValue)
      foregroundContainer.addChild(hoverTextSeqNameLabel)
      foregroundContainer.addChild(hoverTextSeqNameValue)

      // Handle mouseover event to show the hover text
      circleSprite.on('mouseover', () => {
        hoverTextGenomeLabel.visible = true
        hoverTextGenomeValue.visible = true
        hoverTextSeqNameLabel.visible = true
        hoverTextSeqNameValue.visible = true
        hoverTextSeqLengthLabel.visible = true
        hoverTextSeqLengthValue.visible = true
        textBackground.visible = true
      })

      // Handle mouseout event to hide the hover text
      circleSprite.on('mouseout', () => {
        hoverTextGenomeLabel.visible = false
        hoverTextGenomeValue.visible = false
        hoverTextSeqNameLabel.visible = false
        hoverTextSeqNameValue.visible = false
        hoverTextSeqLengthLabel.visible = false
        hoverTextSeqLengthValue.visible = false
        textBackground.visible = false
      })

      // // Create a background rectangle for the text
      // const textBackground = new PIXI.Graphics()
      // textBackground.rect(
      //   0,
      //   0,
      //   hoverText.width + 10,
      //   3 * (hoverText.height + 5)
      // ) // Add some padding around the text
      // textBackground.fill({ color: 0x000000, alpha: 0.7 }) // Semi-transparent black background
      // textBackground.visible = false // Hidden initially

      // // Add the hover text to the foreground container
      // foregroundContainer.addChild(textBackground)
      // foregroundContainer.addChild(hoverText)
      // app.stage.addChild(hoverText)

      // // Handle mouseover event to show the hover text
      // circleSprite.on('mouseover', (event) => {
      //   hoverText.visible = true
      //   textBackground.visible = true
      //   hoverText.x = circleSprite.x + 10 // Slightly offset from the sprite
      //   hoverText.y = circleSprite.y - 10

      //   // Position the background behind the text
      //   textBackground.x = hoverText.x - 5 // Adjust to match text position
      //   textBackground.y = hoverText.y - 2
      //   textBackground.width = hoverText.width + 10
      //   textBackground.height = hoverText.height + 5
      // })

      // // Handle mouseout event to hide the hover text
      // circleSprite.on('mouseout', (event) => {
      //   hoverText.visible = false
      //   textBackground.visible = false
      // })

      // Add the sprite to the Pixi stage

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
    groupSequencesByChromosome(data) {
      const grouped = {}

      data.forEach((sequence) => {
        const chromosome = sequence.phasing_chromosome || 'Unphased'
        if (!grouped[chromosome]) {
          grouped[chromosome] = []
        }
        grouped[chromosome].push(sequence)
      })

      return grouped
    },
  },
}
</script>

<style scoped>
div {
  overflow: hidden;
  position: relative;
}

.child-container {
  flex: 1; /* This will make it inherit the available width */
  width: 100%; /* Ensures full width */
}

/* canvas {
  height: 100%;
  width: 100%;
} */

svg {
  height: 100%;
  width: 100%;
  position: relative;
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

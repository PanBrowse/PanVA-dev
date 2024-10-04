<template>
  <div ref="pixiContainer"></div>
</template>

<script>
import * as d3 from 'd3'
import { mapActions, mapState } from 'pinia'
import * as PIXI from 'pixi.js'

import { lasso } from '@/components/Lasso.js'
import { useGeneSetStore } from '@/stores/geneSet'

export default {
  name: 'PixiCanvas',
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
  },
  mounted() {
    this.$nextTick(async () => {
      try {
        // // Create a PIXI.Application instance
        const app = new PIXI.Application()

        // to-do:
        // - use auto detect renderer instead of graphics object
        // - resize listener when menu collapses
        // - calculate radius based on availabe screen space
        // - space grid a bit more every 5 columns

        // Initialize the application
        await app.init({
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: 0xffffff,
          resolution: window.devicePixelRatio || 1, // Use device's pixel ratio for high-res screens
          antialias: true,
        })

        // Append the canvas to the DOM
        if (this.$refs.pixiContainer) {
          this.$refs.pixiContainer.appendChild(app.canvas)
          console.log('Pixi.js canvas appended successfully.')
        } else {
          console.error('Pixi.js container ref is not found.')
        }

        // Check and log canvas size
        const canvas = app.canvas
        console.log('Initial Canvas Size:', canvas.width, 'x', canvas.height)

        // Set the canvas size dynamically
        this.updateCanvasSize(app)

        // Create a foreground container for hover texts
        const foregroundContainer = new PIXI.Container()

        const circleContainer = new PIXI.Container()

        // Add the foreground container to the stage last
        app.stage.addChild(foregroundContainer)
        app.stage.addChild(circleContainer)

        // // Create a Graphics object
        // const graphics = new PIXI.Graphics()

        const padding = 10
        const circleRadius = 2
        const circleSpacing = 3 * circleRadius
        const chromPadding = 25 // Padding between chromosome grids

        // Calculate the number of columns and rows based on container size
        const containerWidth = this.$refs.pixiContainer.clientWidth
        const containerHeight = this.$refs.pixiContainer.clientHeight
        console.log('containerWidth', containerWidth)
        console.log('containerHeight', containerHeight)

        let numCols = Math.floor(
          (containerWidth - 2 * padding) /
            (2 * circleRadius + 2 * circleSpacing)
        )
        numCols = Math.floor(numCols / 5) * 5 // Make numCols a multiple of 5
        console.log('numCols', numCols, this.sequences.length)

        // Calculate the number of rows needed to fit all the points
        const numRows = Math.ceil(this.sequences.length / numCols)
        console.log('numRows', numRows)

        // Calculate the total grid width and height
        const totalGridWidth =
          numCols * (2 * circleSpacing + 2 * circleRadius) + 2 * padding
        const totalGridHeight =
          numRows * (2 * circleSpacing + 2 * circleRadius) + 2 * padding
        console.log('totalGridWidth', totalGridWidth)
        console.log('totalGridHeight', totalGridHeight)

        let tooltip = null

        // data
        console.log('sequences', this.sequences)
        const sequences_sorted = this.sequences.sort(
          (a, b) => b.sequence_length - a.sequence_length
        )
        console.log('sequences sorted', sequences_sorted)

        const sequencesGrouped =
          this.groupSequencesByChromosome(sequences_sorted)
        console.log('sequencesGrouped', sequencesGrouped)

        // <---------------------Create graphics circle objects---------------------->
        // // Loop through the sorted data and draw circles in a grid
        // const circles = []
        // sequences_sorted.forEach((item, index) => {
        //   const row = Math.floor(index / numCols)
        //   const col = index % numCols

        //   // Position each circle based on the calculated grid and padding
        //   const x = 10 + col * circleSpacing + circleRadius
        //   const y = 10 + row * circleSpacing + circleRadius
        //   // console.log('x', x, 'y', y)

        //   // Create individual circle containers to handle interactivity
        //   const circle = new PIXI.Graphics()
        //   // alternatief: new PIXI.Sprite() -- render texture

        //   // Draw the circle
        //   circle.circle(x, y, circleRadius)
        //   circle.fill(0xd3d3d3)

        //   // Make the circle interactive
        //   circle.interactive = true
        //   circle.buttonMode = true

        //   // // Create the tooltip using PIXI.Text (hidden by default)
        // if (!tooltip) {
        //   tooltip = new PIXI.Text({
        //     text: 'tooltip',
        //     style: {
        //       fontSize: 12,
        //       fill: 0xd62728,
        //       align: 'left',
        //     },
        //   })
        //   tooltip.visible = false // Hide initially
        //   app.stage.addChild(tooltip)
        // }

        // // Hover effect
        // circle.on('mouseover', (event) => {
        //   // Change circle color and size on hover
        //   circle.clear()
        //   circle.circle(x, y, circleRadius + 2)
        //   circle.fill(0xd62728)

        //   // Show sequence_length as tooltip
        //   tooltip.text = `Sequence Length: \n ${
        //     item.sequence_length.toFixed(2) / 1000000
        //   } Mb`
        //   tooltip.x = x + 10
        //   tooltip.y = y - 10
        //   tooltip.visible = true
        // })

        // // Reset on hover out
        // circle.on('mouseout', () => {
        //   circle.clear()
        //   circle.circle(x, y, circleRadius)
        //   circle.fill(0xd3d3d3)

        //   // Hide the tooltip on mouse out
        //   tooltip.visible = false
        // })

        //   // Add the circle to the stage
        //   app.stage.addChild(circle)
        //   circles.push(circle)
        // })
        // <----------------------------------------------------------->

        // <---------------------Create circle sprites ---------------->
        this.createCircleTexture(circleRadius, app)

        const circles = []
        let currentXOffset = padding

        // Loop through each chromosome group and create a grid for its sequences
        Object.entries(sequencesGrouped).forEach(([chromosome, sequences]) => {
          let numCols = Math.ceil(sequences.length / 10) // max 10 rows

          sequences.forEach((sequence, index) => {
            const row = index % 10
            const col = Math.floor(index / 10)

            const x = currentXOffset + col * circleSpacing + circleRadius
            const y = padding + row * circleSpacing + circleRadius

            this.createSprites(
              x,
              y,
              chromosome,
              sequence.sequence_length,
              app,
              circles,
              foregroundContainer,
              circleContainer
            )
          })

          // After placing the grid for this chromosome, move the horizontal offset
          currentXOffset += numCols * circleSpacing + chromPadding
        })
        console.log('circles', circles)
        app.render()

        // <---------------------Simple grid  ---------------------->
        // sequences_sorted.forEach((item, index) => {
        //   const row = Math.floor(index / numCols)
        //   const col = index % numCols

        //   // Position each circle based on the calculated grid and padding
        //   const x = 10 + col * circleSpacing + circleRadius
        //   const y = 10 + row * circleSpacing + circleRadius

        //   this.createSprites(x, y, app, circles)
        // })
        // console.log('circles', circles)

        // // Render the Pixi stage initially
        // app.render()
        // <-------------------------------------------------------->

        console.log(
          'html canvas element check',
          canvas instanceof HTMLCanvasElement
        )

        // --- D3.js Lasso Setup ---
        // const svg = d3
        //   .select(this.$refs.pixiContainer)
        //   .append('svg')
        //   .attr('width', window.innerWidth)
        //   .attr('height', window.innerHeight)
        //   .style('position', 'absolute')
        //   .style('top', '0')
        //   .style('left', '0')
        //   .style('pointer-events', 'none') // Ensure Pixi.js captures pointer events

        // // Lasso initialization
        // const lassoInstance = lasso()
        //   .targetArea(d3.select(canvas)) // canvas as HTMLCanvasElement
        //   .closePathDistance(150)

        // // Lasso selection logic
        // lassoInstance.on('start', () => {
        //   // Remove previous selection effects
        //   circles.forEach((circle) => {
        //     circle.clear()
        //     circle.drawCircle(0, 0, 10)
        //     circle.fill(0x66ccff) // Default fill color
        //   })
        // })

        // lassoInstance.on('draw', () => {
        //   // Update styles of selected items
        //   const selectedCircles = lassoInstance.possibleItems()

        //   selectedCircles.each(function (d, i) {
        //     d.clear()
        //     d.drawCircle(0, 0, 10)
        //     d.fill(0xff0000) // Highlight selected circles
        //   })

        //   app.render() // Re-render the stage after selection
        // })

        // lassoInstance.on('end', () => {
        //   // Apply final selection styles
        //   const selectedCircles = lassoInstance.selectedItems()
        //   selectedCircles.each(function (d, i) {
        //     d.clear()
        //     d.drawCircle(0, 0, 10)
        //     d.fill(0x00ff00) // Final color for selected circles
        //   })

        //   app.render() // Re-render the stage
        // })

        // // Attach lasso to Pixi.js objects
        // lassoInstance.items(app.stage.children)
        // console.log('lassoItems', app.stage.children)

        // // Call lasso on SVG container
        // svg.select('g.lasso').call(lassoInstance) // d3 code

        app.stage.addChild(foregroundContainer)

        // Handle window resizing
        window.addEventListener('resize', () => {
          this.updateCanvasSize(app)
          //   app.renderer.resize(window.innerWidth, window.innerHeight)
          console.log(
            'Canvas resized to:',
            window.innerWidth,
            'x',
            window.innerHeight
          )
        })
      } catch (error) {
        console.error('Error initializing Pixi.js:', error)
      }
    })
  },
  methods: {
    createCircleTexture(circleRadius, app) {
      // Use PIXI.Graphics to draw a circle
      const graphics = new PIXI.Graphics()
      // Draw the circle
      graphics.circle(circleRadius, circleRadius, circleRadius)
      graphics.fill(0xd3d3d3)
      // Generate a texture from the Graphics object
      this.circleTexture = app.renderer.generateTexture(graphics)
    },
    createSprites(
      x,
      y,
      chromosome,
      sequence_length,
      app,
      circles,
      foregroundContainer,
      circleContainer
    ) {
      if (!this.circleTexture) {
        console.error('Circle texture is not created.')
        return
      }

      // Create a sprite using the circle texture
      const circleSprite = new PIXI.Sprite(this.circleTexture)
      circleSprite.x = x
      circleSprite.y = y

      // Add interactivity to the sprite
      circleSprite.interactive = true
      circleSprite.buttonMode = true

      // Create a PIXI.Text object to show the hover text (hidden by default)
      const hoverText = new PIXI.Text({
        text: `${
          sequence_length > 100000
            ? (sequence_length / 1000000).toFixed(2) + ' Mb'
            : (sequence_length / 1000).toFixed(2) + ' Kb'
        }`,
        style: {
          fontSize: 8,
          fill: 0xffffff,
          align: 'left',
          resolution: window.devicePixelRatio || 1,
        },
      })
      hoverText.visible = false // Hidden initially

      // Create a background rectangle for the text
      const textBackground = new PIXI.Graphics()
      textBackground.rect(0, 0, hoverText.width + 10, hoverText.height + 5) // Add some padding around the text
      textBackground.fill({ color: 0x000000, alpha: 0.7 }) // Semi-transparent black background
      textBackground.visible = false // Hidden initially

      // Add the hover text to the foreground container
      foregroundContainer.addChild(textBackground)
      foregroundContainer.addChild(hoverText)
      // app.stage.addChild(hoverText)

      // Handle mouseover event to show the hover text
      circleSprite.on('mouseover', (event) => {
        hoverText.visible = true
        textBackground.visible = true
        hoverText.x = circleSprite.x + 10 // Slightly offset from the sprite
        hoverText.y = circleSprite.y - 10

        // Position the background behind the text
        textBackground.x = hoverText.x - 5 // Adjust to match text position
        textBackground.y = hoverText.y - 2
        textBackground.width = hoverText.width + 10
        textBackground.height = hoverText.height + 5
      })

      // Handle mouseout event to hide the hover text
      circleSprite.on('mouseout', (event) => {
        hoverText.visible = false
        textBackground.visible = false
      })

      // Add the sprite to the Pixi stage

      circleContainer.addChild(circleSprite)

      circles.push({
        sprite: circleSprite,
        x: x,
        y: y,
        selected: false, // Track selection status
        chromosome: chromosome,
      })
    },
    updateCanvasSize(app) {
      const container = this.$refs.pixiContainer
      if (container) {
        // Set canvas size to fit the container
        app.renderer.resize(container.clientWidth, container.clientHeight)
      }
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
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative; /* Ensure the container has relative positioning */
}
canvas {
  display: block; /* Ensure the canvas is displayed as a block-level element */
}
</style>

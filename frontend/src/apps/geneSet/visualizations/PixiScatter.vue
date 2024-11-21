<!-- <template>
  <div class="child-container" ref="view">
    <canvas ref="pixi"></canvas>
    <svg ref="lasso"><g class="lasso"></g></svg>
  </div>
</template> -->

<template>
  <ACard
    title="Grid Overview"
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
import { Viewport } from 'pixi-viewport'
import { defineComponent, onMounted, ref, watch } from 'vue'

import { lasso } from '@/components/Lasso.js'
import { useGeneSetStore } from '@/stores/geneSet'
import { useGenomeStore } from '@/stores/geneSet'
import type { Gene, Genome, GenomeData } from '@/types'

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
        console.log(
          'lasso selection from watch pixi scatter',
          _newLassoSelection
        )
        await updateSelectedGeneUids()
      },
      { immediate: true }
    )

    return {
      selectedGeneUids,
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
        const isShiftPressed = ref(false);
        this.isShiftPressed = isShiftPressed;
        console.log(isShiftPressed.value)

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
          resolution: window.devicePixelRatio || 1,
          autoResize: true,
          antialias: true,
          autoDensity: true,
          canvas: this.$refs.pixi,
          resizeTo: this.$refs.view,
        })

        // Create the viewport
        const viewport = new Viewport({
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          worldWidth: 2000, // Adjust this value to fit your data
          worldHeight: 2000,
          autoResize: true,
          resolution: window.devicePixelRatio || 1,
          canvas: this.$refs.pixi,
          events: app.renderer.events,
        })
        this.viewport = viewport

        // Add the viewport to the PIXI stage
        app.stage.addChild(this.viewport)
        console.log('Viewport added to stage:', this.viewport)



        this.viewport.interactive = true

        this.viewport.drag({
              pressDrag: false, // Enables dragging
        });

        // Enable viewport plugins
        this.viewport.wheel().decelerate(); // Enable mouse wheel zoom and panning

        const onFocusCanvas = () => {
          console.log('Canvas focused, keyboard events will be captured');

          if (canvas) {
            canvas.addEventListener('keydown', onKeyDown);
            canvas.addEventListener('keyup', onKeyUp);
          }
        };

        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Shift') {
     
            this.isShiftPressed.value = true
            this.viewport.drag({
              pressDrag: true, // Enables dragging
            });
          }
            if (this.lassoInstance) {
              console.log('Removing lasso.');

              // Clear lasso paths
              d3.select(this.$refs.lasso).selectAll('path').remove();
              d3.select(this.$refs.lasso).selectAll('circle').remove();

            }
            console.log('*** key shift pressed from canvas focus', this.isShiftPressed.value)
          

        }

        const onKeyUp = (event: KeyboardEvent) => {
          if (event.key === 'Shift') {
            this.isShiftPressed.value = false
            console.log('*** key shift NOT pressed from canvas focus', this.isShiftPressed.value)

            this.viewport.drag({
              pressDrag: false, // Enables dragging
            });

            this.initializeLasso(canvas)
          }

        }


        const onBlurCanvas = () => {
          console.log('Canvas blurred, keyboard events ignored');
        };

        app.canvas.addEventListener('focus', onFocusCanvas);
        app.canvas.addEventListener('blur', onBlurCanvas);
        // Make canvas focusable and auto-focus on click
        app.canvas.setAttribute('tabindex', '0');
        app.canvas.addEventListener('mouseover', () => {canvas.focus();})


        viewport.on('wheel', (e) => {
          console.log('Wheel event detected on viewport:', e)
       
        })

        viewport.on('drag', (e) => {
          console.log('Drag event detected on viewport:', e)
       
        })

          this.viewport.on('zoomed', () => {
            const zoomLevel = this.viewport.scale.x;
            const resolution = window.devicePixelRatio * zoomLevel;

            console.log('zoomed', this.circleTexture.source.resolution, this.viewport.scale.x)

            const circleRadius = 5 * devicePixelRatio 

            // Regenerate the circle texture
            this.circleTexture = this.createCircleTexture(circleRadius, resolution);

            // Update all sprites
            this.viewport.children.forEach((sprite) => {
                sprite.texture = this.circleTexture;
            });
            // this.drawGrid();

            this.app.render();
        });

        app.canvas.addEventListener('wheel', (e) => {
          e.preventDefault() // Stop default browser scroll behavior
          // console.log('Wheel event on canvas:', e);
          // Manually forward the event to the Viewport
          viewport.emit('wheel', e)
        })

        app.canvas.addEventListener('drag', (e) => {
          e.preventDefault() // Stop default browser scroll behavior
          console.log('Drag event on canvas:', e);

          // Manually forward the event to the Viewport
          viewport.emit('drag', e)
        })

        // Check and log canvas size
        const canvas = app.canvas
        console.log('Initial Canvas Size:', canvas.width, 'x', canvas.height)

        // Set the canvas size dynamically
        this.resizeWindow(app)

        // // Create a foreground container for hover texts
        // const foregroundContainer = new PIXI.Container()
        // const circleContainer = new PIXI.Container()
        // this.circleContainer = circleContainer

        // app.stage.addChild(circleContainer)
        // this.viewport.addChild(circleContainer)

        this.drawGrid()

        // Add watcher for selectedSequencesLasso
        this.$watch(
          () => this.genomeStore.selectedSequencesLasso,
          (newSelectedSequences) => {
            console.log('Lasso selection updated:', newSelectedSequences)

            if (this.viewport) {
              this.viewport.children.forEach((sprite: any) => {
                const isSelected = newSelectedSequences.includes(
                  sprite.sequence_uid
                )
                const isTracked = this.genomeStore.selectedSequencesTracker.has(
                  sprite.sequence_uid
                )
                // Update sprite styles based on its state
                if (isSelected) {
                  sprite.tint = 0x007bff // Blue for selected
                  // sprite.alpha = 1 // Full opacity
                  // } else if (isTracked) {
                  //   sprite.tint = 0xa9a9a9 // Dark grey for tracked
                  //   sprite.alpha = 0.75 // Slightly dimmer
                } else {
                  sprite.tint = 0xd3d3d3 // Default gray for unselected
                  sprite.alpha = 0.5 // Dimmed
                }
              })
            }
            this.app.render()
          },
          { immediate: true }
        )

        // app.stage.addChild(foregroundContainer)

        // Watch for embedding changes
        this.$watch(
          () => this.genomeStore.filterEmpty,
          (value) => {
            console.log('Embedding changed in PixiUMAP watcher:', value)

            // genomeStore.selectedSequencesLasso = [];

            this.drawGrid()
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

        console.log('PixiScatter loaded event emitted')
        this.$emit('loaded')
      } catch (error) {
        console.error('Error initializing Pixi.js:', error)
      }
    })
  },
  methods: {
    drawGrid() {
      // Clear previous content
      // if (this.app) {
      //   this.app.stage.removeChildren()
      // }

      // // Clear previous content
      // if (this.circleContainer) {
      //   this.circleContainer.removeChildren() // Clear all children from the container
      // }

      // this.app.stage.addChild(this.circleContainer)
      // // this.app.stage.addChild(this.foregroundContainer)

      if (!this.viewport) {
        console.error('Viewport is not initialized.')
        return
      }

      // Clear the viewport
      this.viewport.removeChildren()

      const app = this.app
      // const circleContainer = this.circleContainer
      const devicePixelRatio = window.devicePixelRatio || 1
      const padding = 10
      const circleRadius = 5 * devicePixelRatio
      const circleSpacing = (2 * circleRadius) / devicePixelRatio
      const genomeGap = 20 * devicePixelRatio // Extra gap between genomes
      const zoomLevel = this.viewport.scale.x;
      const resolution = window.devicePixelRatio * zoomLevel;

      // Create the circle texture
      this.circleTexture = this.createCircleTexture(circleRadius, resolution)


      // Check and log canvas size
      const canvas = this.app.canvas
      console.log('Initial Canvas Size:', canvas.width, 'x', canvas.height)

      // Set the canvas size dynamically
      this.resizeWindow(this.app)

      // Get canvas dimensions
      const canvasWidth = app.renderer.width
      const canvasHeight = app.renderer.height

      // Calculate grid dimensions
      const maxCols = Math.floor(
        (canvasWidth - 2 * padding) / (2 * circleRadius + circleSpacing)
      )

      console.log('Canvas dimensions:', canvasWidth, canvasHeight)
      console.log('Max columns:', maxCols)

      let currentX = padding
      let currentY = padding

      const filterEmpty = this.genomeStore.filterEmpty

      // Iterate over genomes
      this.genomeStore.genomeData.genomes.forEach((genomeData) => {
        const sequences = genomeData.sequences

        sequences.forEach((sequence, index) => {
          // Create sprite for each sequence

          const shouldDraw =
            !filterEmpty || (sequence.loci && sequence.loci.length > 0)

          if (shouldDraw) {
            const circleSprite = new PIXI.Sprite(this.circleTexture)

            // Check if this sequence is part of the selectedSequencesLasso
            const isSelected = this.genomeStore.selectedSequencesLasso.includes(
              sequence.uid
            )
            circleSprite.tint = isSelected ? 0x007bff : 0xd3d3d3 // Blue if selected, gray otherwise
            // circleSprite.tint = 0xd3d3d3 // Default color
            circleSprite.alpha = 0.5
            circleSprite.sequence_uid = sequence.uid

            circleSprite.x = currentX
            circleSprite.y = currentY

            // circleContainer.addChild(circleSprite)
            this.viewport.addChild(circleSprite)
          }

          // Move to the next column
          currentX += 2 * circleRadius + circleSpacing

          // Wrap to the next row if maxCols is reached
          if ((index + 1) % maxCols === 0) {
            currentX = padding
            currentY += 2 * circleRadius + circleSpacing
          }
        })

        // Add extra gap for the next genome group
        currentX = padding
        currentY += 2 * circleRadius + circleSpacing + genomeGap
      })
      this.app.stage.addChild(this.viewport)

      app.render()

      //  Reinitialize the lasso
      if (!this.isDragging) {
        this.initializeLasso(canvas)
      }

      // console.log(this.lassoInstance.items())
    },
    initializeLasso(canvas) {

      // Ensure lasso SVG and elements are properly set up
      const svg = d3
        .select(this.$refs.lasso)
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
      this.lassoInstance.items(this.viewport.children as PIXI.Sprite[])
      svg.select('g.lasso').call(this.lassoInstance)

      // // Store lasso instance for further interaction
      // this.lassoInstance = lassoInstance;

      console.log('Lasso initialized and added.')
    },
    lassoStart() {
      if (this.isShiftPressed.value === true) {
        console.log('Skipping lasso start due to Shift key being pressed.');
        return;
      }

      const genomeStore = useGenomeStore()
      console.log('Lasso selection started', genomeStore.selectedSequencesLasso)
      const trackerUids = genomeStore.selectedSequencesTracker

      // Filter the sprites in lassoInstance based on sequence_uids in tracker
      const trackedSprites = this.lassoInstance.items().filter((sprite) => {
        return trackerUids.has(sprite.sequence_uid) // Check if sprite's UID is in the tracker
      })

      // // Apply different tint to sprites in the tracker
      // trackedSprites.forEach((sprite) => {
      //   sprite.tint = 0xa9a9a9 // darker tint for previously selected sprites
      //   sprite.alpha = 0.5 // Set opacity to 50%
      // })
      if (this.selectedSprites) {
        this.selectedSprites.forEach((sprite) => {
          if (!trackerUids.has(sprite.sequence_uid)) {
            sprite.tint = 0xd3d3d3 // default tint for unmatched sprites
            sprite.alpha = 0.5 // Set opacity to 50%
          }
        })
      }
    },
    lassoDraw() {
      if (this.isShiftPressed.value === true) {
        console.log('Skipping lasso draw due to Shift key being pressed.');
        return;
      }
    },
    lassoEnd() {

      if (this.isShiftPressed.value === true) {
        console.log('Skipping lasso end due to Shift key being pressed.');
        return;
      }
      console.log('lasso end')

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

        this.lassoInstance.reset()

        // this.$forceUpdate();
      } catch (error) {
        console.error('Error in lassoEnd:', error)
      }

      // // add the drawn path for the lasso
      // const dyn_path = d3
      //   .select(this.$refs.lasso)
      //   .select('g.lasso')
      //   .select('g.lasso')
      //   .select('path.drawn')

      // // add a closed path
      // const close_path = d3
      //   .select(this.$refs.lasso)
      //   .select('g.lasso')
      //   .select('g.lasso')
      //   .select('path.loop_close')

      // // add an origin node
      // const origin_node = d3
      //   .select(this.$refs.lasso)
      //   .select('g.lasso')
      //   .select('g.lasso')
      //   .select('circle.origin')

      // const lassoPath = dyn_path.attr('d') // Get the current lasso path
      // // console.log('Lasso path data at end:', lassoPath)

      // if (!lassoPath || lassoPath.length < 3) {
      //   // console.warn('Lasso selection is empty or too small.')
      //   return // Exit early
      // }

      // const polygonPoints = this.getPolygonFromPath(dyn_path.node())

      // // Log the points to the console
      // console.log('Polygon Points:', polygonPoints)
      // const selectedSprites = this.lassoInstance.items().filter((sprite) => {
      //   const { x, y } = sprite.position
      //   // console.log('{ x, y } ', { x, y })
      //   return this.isPointInPolygon(x, y, polygonPoints) // Check if sprite is inside the lasso polygon
      // })

      // setTimeout(() => {
      //   dyn_path.attr('d', null) // Clear the lasso path after a delay if needed
      //   close_path.attr('d', null) // Clear the close path after a delay if needed
      // }, 1000) // Adjust the delay as needed (e.g., 2000 ms = 2 seconds)
      // origin_node.attr('display', 'none')

      // console.log('Lasso path cleared in drawEnd.')

      // // Apply effects to selected sprites
      // selectedSprites.forEach((sprite) => {
      //   sprite.tint = 0x007bff // Set sprite color to blue
      //   sprite.alpha = 1
      // })

      // console.log('Selected sprites:', selectedSprites)
      // this.selectedSprites = selectedSprites
      // // Flattening the array and extracting UIDs
      // const flattenedSequenceUids = selectedSprites
      //   .flat()
      //   .map((sprite) => sprite.sequence_uid)

      // console.log(flattenedSequenceUids)

      // const genomeStore = useGenomeStore() // Create an instance of the store
      // // Save UIDs to the store
      // genomeStore.setSelectedSequencesLasso(flattenedSequenceUids)
      // // console.log(
      // //   'Updated store with current lasso selection:',
      // //   genomeStore.selectedSequencesLasso
      // // )

      // genomeStore.setSelectedSequencesTracker(flattenedSequenceUids)
      // // console.log(
      // //   'Updated store lasso selection tracker:',
      // //   genomeStore.selectedSequencesTracker
      // // )

      // this.$forceUpdate() // might not need this?
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
    createCircleTexture(circleRadius, resolution) {

      const res = Math.max(1, window.devicePixelRatio) * (this.viewport?.scale.x || 1);
      console.log('Generating texture with resolution:', res);

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

      // // Generate a texture from the Graphics object
      // // const resolution = 10 * this.viewport.scale.x
      // const texture = this.app.renderer.generateTexture(graphics, {
      //   resolution: window.devicePixelRatio * (this.viewport?.scale.x || 1),
      // })
      // // texture.baseTexture.update();
      // console.log('Base texture resolution:', texture.source.resolution, this.viewport?.scale.x);
      // return texture
      // Create a render texture for the circle
      const renderTexture = PIXI.RenderTexture.create({
          width: circleRadius*2.5,
          height: circleRadius*2.5,
          resolution: Math.max(2, window.devicePixelRatio * this.viewport.scale.x), // Adjust resolution based on zoom  
      });

      // Render the graphics to the texture
      this.app.renderer.render(graphics, { renderTexture });

      return renderTexture;
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
      const circleSprite = new PIXI.Sprite()
      // Assign the texture
      circleSprite.texture = this.circleTexture;

      circleSprite.tint = 0xd3d3d3
      circleSprite.alpha = 0.5 // Set opacity to 50%

      // Check if this sequence is part of the selectedSequencesLasso
      const isSelected =
        this.genomeStore.selectedSequencesLasso.includes(sequence_uid)
      circleSprite.tint = isSelected ? 0x007bff : 0xd3d3d3 // Blue if selected, gray otherwise
      // circleSprite.alpha = isSelected ? 1 : 0.5

      circleSprite.sequence_uid = sequence_uid

      // Add interactivity to the sprite
      circleSprite.interactive = true
      circleSprite.buttonMode = true

      circleSprite.x = x
      circleSprite.y = y

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
canvas {
  pointer-events: auto;
  z-index: 10;
}

.child-container {
  flex: 1; /* This will make it inherit the available width */
  width: 100%; /* Ensures full width */
  pointer-events: auto;
  position: relative;
}

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

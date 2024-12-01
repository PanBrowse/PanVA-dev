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
import { Viewport } from 'pixi-viewport'
import { defineComponent, onMounted, ref, watch } from 'vue'

import { lasso } from '@/components/Lasso.js'
import { useGenomeStore } from '@/stores/geneSet'

import { parseSVG } from 'svg-path-parser';

const globalSelectedSprites = ref<string[]>([])
// to-do: need to use these again:
const circleTexture = ref<PIXI.Texture>()
const lassoInstance = ref<lasso>()


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
    // distanceMatrix: {
    //   type: Array,
    //   required: true,
    // },
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
        const isShiftPressed = ref(false)
        this.isShiftPressed = isShiftPressed
        console.log(isShiftPressed.value)
        const focusContainer = this.$refs.focusContainer;

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
          resolution: 3,
          autoResize: true,
          autoDensity: true,
          antialias: true,
          canvas: this.$refs.pixi,
          resizeTo: this.$refs.view, // or window
        })

        // Create the viewport
        const viewport = new Viewport({
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          worldWidth: 2000, // Adjust this value to fit your data
          worldHeight: 2000,
          autoResize: true,
          resolution: 3,
          canvas: this.$refs.pixi,
          resizeTo: this.$refs.view,
          events: app.renderer.events,
        })
        this.viewport = viewport


        // Add the viewport to the PIXI stage
        app.stage.addChild(this.viewport)
        console.log('Viewport added to stage:', this.viewport)

        this.viewport.interactive = true
        this.viewport.sortableChildren = true; 

        this.viewport.drag({
          pressDrag: false, // Enables dragging
        })

        // Enable viewport plugins
        this.viewport.wheel().decelerate() // Enable mouse wheel zoom and panning


        const foregroundContainer = new PIXI.Container()
        const circleContainer = new PIXI.Container({
          isRenderGroup: true, // Enable GPU-accelerated rendering
        })


        // Create a container for connection lines
        const linesContainer = new PIXI.Container();
        linesContainer.zIndex = 0; // Lowest layer for connections
        this.viewport.addChild(linesContainer); // Add the lines container to the viewport
        this.linesContainer = linesContainer;

        // Create a container for sprites
        const spritesContainer = new PIXI.Container();
        spritesContainer.zIndex = 1; // Above lines
        this.viewport.addChild(spritesContainer); // Add the sprites container to the viewport
        this.spritesContainer = spritesContainer

        const tooltipContainer = new PIXI.Container();
        tooltipContainer.zIndex = 2; // Above sprites and lines, below lasso
        tooltipContainer.interactive = false;
        tooltipContainer.interactiveChildren = false;
        this.viewport.addChild(tooltipContainer);
        this.tooltipContainer = tooltipContainer;
   




        this.foregroundContainer = foregroundContainer
        this.circleContainer = circleContainer

        // this.renderEmbedding(embedding)
        this.drawEmbedding(embedding);
        // this.drawTooltips();

        const onFocusCanvas = () => {
          console.log('UMAP Canvas focused, keyboard events will be captured')

          if (canvas) {
            canvas.addEventListener('keydown', onKeyDown)
            canvas.addEventListener('keyup', onKeyUp)
          }
        }

        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Shift') {
            this.isShiftPressed.value = true
            this.viewport.drag({
              pressDrag: true, // Enables dragging
            })
          }
          if (lassoInstance.value) {
            console.log('Removing UMAP lasso.')

            // Clear lasso paths
            d3.select(this.$refs.lasso_umap).selectAll('path').remove()
            d3.select(this.$refs.lasso_umap).selectAll('circle').remove()
          }
          console.log(
            '*** key shift pressed from UMAP canvas focus',
            this.isShiftPressed.value
          )
        }

        const onKeyUp = (event: KeyboardEvent) => {
          if (event.key === 'Shift') {
            this.isShiftPressed.value = false
            console.log(
              '*** key shift NOT pressed from UMAP canvas focus',
              this.isShiftPressed.value
            )

            this.viewport.drag({
              pressDrag: false, // Enables dragging
            })

            this.initializeLasso(canvas)
          }
        }

        const onBlurCanvas = () => {
          if (canvas) {
            canvas.blur(); // Explicitly remove focus
            console.log('UMAP Canvas blurred, keyboard events ignored');
          }
        }

        app.canvas.addEventListener('focus', onFocusCanvas)
        app.canvas.addEventListener('blur', onBlurCanvas)
        // Make canvas focusable and auto-focus on click
        app.canvas.setAttribute('tabindex', '0')
        app.canvas.addEventListener('mouseover', () => {
          canvas.focus({ preventScroll: true });
        })
        app.canvas.addEventListener('mouseleave', () => {
          canvas.blur()
        })

        viewport.on('wheel', (e) => {
        //   console.log('Wheel event detected on viewport:', e)
        })

        viewport.on('drag', (e) => {
          // console.log('Drag event detected on viewport:', e)
        })

        this.viewport.on('moved', (event) => {
          const zoomLevel = this.viewport.scale.x
          const resolution = window.devicePixelRatio * zoomLevel

          console.log('zoomlevel:', zoomLevel)

           // Ensure linesContainer exists
          if (!this.linesContainer) {
            this.linesContainer = new PIXI.Container();
            this.viewport.addChildAt(this.linesContainer,0);
          }

          this.spritesContainer.children.forEach((sprite) => {
          // this.viewport.children.forEach((sprite) => {
            if (sprite.sequence_uid) {
              const geneCount =
                genomeStore.sequenceToLociGenesLookup.get(sprite.sequence_uid)
                  ?.genes.length || 1;

              // Compute border thickness based on zoom level
              let borderThickness = 0; // No border at low zoom levels

              if (zoomLevel > 1) {
                // Gradually increase thickness from zoom level 1 to 2
                const transitionProgress = Math.min(1, (zoomLevel - 1) / 1);
                borderThickness =
                  transitionProgress * Math.min(10, Math.log2(geneCount + 1) + 1);
              } else {
                // Keep the border invisible for zoom levels <= 1
                borderThickness = 0;
              }

              // Update the sprite's texture with the calculated border thickness
              const circleRadius = 5 * window.devicePixelRatio;
              const { texture, totalRadius } = this.createCircleTexture(
                circleRadius,
                resolution,
                borderThickness
              );

              sprite.texture = texture
              sprite.totalRadius = totalRadius
              // sprite.texture = this.createCircleTexture(
              //   circleRadius,
              //   resolution,
              //   borderThickness
              // );

              // Spread out sprites in the x-direction based on zoom level
              // The higher the zoom level, the greater the spacing factor
              const spacingFactor = 1 + Math.max(0, (zoomLevel -1)); // Adjust factor to control spacing sensitivity
              sprite.x = sprite.originalX * spacingFactor; // `originalX` holds the base position
            }
          });

          
          this.app.render()
        
          // if (zoomLevel>2){
          //    // Access all sprites in the viewport
          //   this.viewport.children.forEach((sprite) => {
          //     if (sprite.sequence_uid) {
          //       console.log('Sprite moved:', sprite.sequence_uid, sprite.x, sprite.y, genomeStore.sequenceToLociGenesLookup.get(sprite.sequence_uid)?.genes.length);
          //     }
          //   });
            
          // }
          // // const { x: mouseWorldX, y: mouseWorldY } = this.viewport.toWorld(event.clientX, event.clientY);
          // // console.log('mouse x and mouse y during zoom', {mouseWorldX, mouseWorldY})

          // const circleRadius = 5 * devicePixelRatio

          // // Regenerate the circle texture
          // circleTexture.value = this.createCircleTexture(
          //   circleRadius,
          //   resolution,
          //   0.5
          // )

          // // Update all sprites
          // this.viewport.children.forEach((sprite) => {
          //   sprite.texture = circleTexture.value
          // })
          // // this.drawGrid();
        
          // Dynamically toggle links based on zoom level
          if (zoomLevel > 0.5) {
            // Draw connections if zoom level is high enough
            this.drawConnections();
          } else {
            // Hide connections by clearing the linesContainer
            this.linesContainer.visible = false; // Hide instead of removing children
          }

          // Ensure visibility of linesContainer at higher zoom levels
          if (zoomLevel > 0.5 && !this.linesContainer.visible) {
            this.linesContainer.visible = true;
          }

          this.app.render();

        })

        app.canvas.addEventListener('wheel', (e) => {
          e.preventDefault() // Stop default browser scroll behavior
          // console.log('Wheel event on canvas:', e);
          // Manually forward the event to the Viewport
          viewport.emit('wheel', e)
        })

        app.canvas.addEventListener('drag', (e) => {
          e.preventDefault() // Stop default browser scroll behavior
          console.log('Drag event on canvas:', e)

          // Manually forward the event to the Viewport
          viewport.emit('drag', e)
        })

        // Check and log canvas size
        const canvas = app.canvas
        console.log('Initial Canvas Size:', canvas.width, 'x', canvas.height)

        // Set the canvas size dynamically
        this.resizeWindow(app)

         // Add watcher for selectedSequencesLasso
         this.$watch(
          () => this.genomeStore.selectedSequencesLasso,
          (newSelectedSequences) => {
            console.log('Lasso selection updated:', newSelectedSequences)

            if (this.viewport) {
              this.spritesContainer.children.forEach((sprite: any) => {
                const isSelected = newSelectedSequences.includes(
                  sprite.sequence_uid
                )
                const isTracked = this.genomeStore.selectedSequencesTracker.has(
                  sprite.sequence_uid
                )
                // Update sprite styles based on its state
                if (isSelected) {
                  sprite.tint = 0x007bff // Blue for selected
                  sprite.alpha = 0.5 // Dimmed
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
            this.app?.render()
          },
          { immediate: true }
        )

        // Watch for embedding changes
        this.$watch(
          () => this.embedding,
          (newEmbedding) => {
            console.log('Embedding changed in PixiUMAP watcher:', newEmbedding)

            // genomeStore.selectedSequencesLasso = [];

            // this.renderEmbedding(newEmbedding)
            this.drawEmbedding(newEmbedding)
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
    drawEmbedding(embedding){

      // Ensure spritesContainer is created
      if (!this.spritesContainer) {
        this.spritesContainer = new PIXI.Container();
        this.viewport.addChild(this.spritesContainer); // Add spritesContainer to the viewport
      }

        // Clear the spritesContainer
        this.spritesContainer.removeChildren();

      if (!this.viewport) {
        console.error("Viewport is not initialized.");
        return;
      }

      const app = this.app
      // const circleContainer = this.circleContainer
      const devicePixelRatio = window.devicePixelRatio || 1
      const padding = 10
      const circleRadius = 5 * devicePixelRatio
      const zoomLevel = this.viewport.scale.x
      const resolution = window.devicePixelRatio * zoomLevel
      

      // Create the circle texture
      const { texture, totalRadius } = this.createCircleTextureNew(circleRadius, resolution, 0.5)
      circleTexture.value = texture

      // Check and log canvas size
      const canvas = this.app.canvas
      console.log('Initial Canvas Size:', canvas.width, 'x', canvas.height)

      // Set the canvas size dynamically
      this.resizeWindow(this.app)

      // Get canvas dimensions
      const canvasWidth = app.renderer.width
      const canvasHeight = app.renderer.height

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

      // Determine the labels based on filterEmpty
      const labels = this.genomeStore.filterEmpty
        ? this.createReverseLookup(
            this.genomeStore.distanceMatrixLabelsFiltered
          )
        : this.createReverseLookup(this.genomeStore.distanceMatrixLabels)

      const sequencePropertiesLookup = this.genomeStore.sequencePropertiesLookup


      embedding.forEach(([x, y], index) => {
        const scaledX = (x - minX) * scale + padding
        const scaledY = (y - minY) * scale + padding


        this.drawSequenceSprite(scaledX, scaledY, index, labels, sequencePropertiesLookup)

      })


      this.app.render()

      //  Reinitialize the lasso
      this.initializeLasso(canvas)

    },
    drawTooltips() {
      console.log('Drawing tooltips in UMAP');

      // Ensure the tooltipContainer is created and ordered correctly
      if (!this.tooltipContainer) {
        this.tooltipContainer = new PIXI.Container();
        this.tooltipContainer.zIndex = 2; // Ensure it is above sprites and lines
        this.viewport.addChildAt(this.tooltipContainer,2);
      }

      // Clear existing tooltips
      this.tooltipContainer.removeChildren(); // Remove any previous tooltips

      // Iterate over the sprites and create tooltips for each
      this.spritesContainer.children.forEach((sprite) => {
        if (!sprite.sequence_uid) return; // Skip if the sprite doesn't have a sequence_uid

        const geneCount = this.genomeStore.sequenceToLociGenesLookup.get(sprite.sequence_uid)
                  ?.genes.length || 1

        const textStyle = new PIXI.TextStyle({
          fontFamily: 'Arial',
          fontSize: 12, // Ensure this is a valid number
          fill: 0x000000, // Hex color or valid CSS color string
          align: 'center',
        });

        // Create a tooltip for the sprite
        const tooltipText = new PIXI.Text({text: sprite.sequence_id, style: textStyle});

        tooltipText.x = sprite.x + 15;
        tooltipText.y = sprite.y
        tooltipText.visible = false; // Start hidden
        tooltipText.sequence_uid = sprite.sequence_uid
        tooltipText.resolution = window.devicePixelRatio || 1;
        tooltipText.scale.set(1 / this.viewport.scale.x); 

        // Attach the tooltip to the sprite for interactivity
        tooltipText.relatedSprite = sprite; //



        // Add tooltip visibility handlers
        sprite.interactive = true;
        sprite.on('mouseover', () => {
          this.highlightLinks(sprite.sequence_uid, true); // Highlight links when hovering
        });
        sprite.on('mouseout', () => {
          this.highlightLinks(sprite.sequence_uid, false); // Reset links when not hovering
        });

        // Add the tooltip to the tooltipContainer
        // this.tooltipContainer.addChild(tooltipBackground);

        this.tooltipContainer.addChild(tooltipText);

      });

      console.log('Tooltips created and added to the container.');

      const canvas = this.app.canvas
      this.initializeLasso(canvas)

      this.app.render();
    },
    drawConnections(useAggregateLinks = true) {

      console.log('drawing connections')
      // // Clear existing lines
      // if (!this.connectionGraphics) {
      //   this.connectionGraphics = new PIXI.Graphics();
      //   this.viewport.addChildAt(this.connectionGraphics, 0); // Add to the back
      // }
      // this.connectionGraphics.clear();


      // this.viewport.addChild(this.connectionGraphics)

      // Ensure the connectionGraphics container is created and ordered correctly
      if (!this.linesContainer) {
        this.linesContainer = new PIXI.Container();
        this.viewport.addChildAt(this.linesContainer, 0); // Add to the back
      }

      // Clear existing lines
      this.linesContainer.removeChildren(); // Clear previous connections

      // this.connectionGraphics = new PIXI.Graphics();


      const spriteLinks = this.genomeStore.sequenceHomologyLinks;

      // Map sequence_uid to sprite for easy lookup
      const spriteMap = new Map();
      this.spritesContainer.children.forEach((sprite) => {
      // this.viewport.children.forEach((sprite) => {
        if (sprite.sequence_uid) {
          spriteMap.set(sprite.sequence_uid, sprite);
        }
      });

      if (useAggregateLinks) {
        const sequenceOrder = this.genomeStore.sequenceHomologyMatrixlabels;
        const homologyMatrix = this.genomeStore.sequenceHomologyMatrix;

        // Iterate over the matrix
        for (let i = 0; i < sequenceOrder.length; i++) {
          for (let j = i + 1; j < sequenceOrder.length; j++) { // Upper triangle only
            const sourceUid = sequenceOrder[i];
            const targetUid = sequenceOrder[j];
            const sharedCount = homologyMatrix[i][j];

            if (sharedCount > 0) {
              const sourceSprite = spriteMap.get(sourceUid);
              const targetSprite = spriteMap.get(targetUid);
              if (!sourceSprite || !targetSprite) continue;

              const sourceX = sourceSprite.x + sourceSprite.totalRadius;
              const sourceY = sourceSprite.y + sourceSprite.totalRadius;
              const targetX = targetSprite.x + targetSprite.totalRadius;
              const targetY = targetSprite.y + targetSprite.totalRadius;

              // Calculate control point for curvature
              const controlX = (sourceX + targetX) / 2 + (targetY - sourceY) * 0.2;
              const controlY = (sourceY + targetY) / 2 + (sourceX - targetX) * 0.2;

              // Normalize line width directly based on sharedCount
              const normalizedWidth = Math.max(sharedCount / 5, 1); // Ensure minimum width

              // Draw the line
              const connectionGraphics = new PIXI.Graphics();
              connectionGraphics.moveTo(sourceX, sourceY);
              connectionGraphics.quadraticCurveTo(
                controlX,
                controlY,
                targetX,
                targetY
              );
              connectionGraphics.stroke({
                width: normalizedWidth,
                color: 0xd3d3d3,
                alpha: 0.7,
              });

              // Add metadata for interaction/debugging
              connectionGraphics.sourceSequenceUid = sourceUid;
              connectionGraphics.targetSequenceUid = targetUid;
              connectionGraphics.linkCount = sharedCount;

              connectionGraphics.startX = sourceX;
              connectionGraphics.startY = sourceY;
              connectionGraphics.controlX = controlX;
              connectionGraphics.controlY = controlY;
              connectionGraphics.endX = targetX;
              connectionGraphics.endY = targetY;

              // Add to the lines container
              this.linesContainer.addChild(connectionGraphics);
              }
            }
          }
      
      } else {

      // Draw connections based on homology links
      this.spritesContainer.children.forEach((sprite) => {
      // this.viewport.children.forEach((sprite) => {
        if (!sprite.sequence_uid || !spriteLinks[sprite.sequence_uid]) return;

        const sourceX = sprite.x + sprite.totalRadius;
        const sourceY = sprite.y + sprite.totalRadius;

        const links = spriteLinks[sprite.sequence_uid];
        links.forEach((link) => {
          const targetSprite = spriteMap.get(link.targetUid);
          if (!targetSprite) return;

          const targetX = targetSprite.x + targetSprite.totalRadius;
          const targetY = targetSprite.y + targetSprite.totalRadius;

          // Calculate control point for curvature
          const controlX = (sourceX + targetX) / 2 + (targetY - sourceY) * 0.2; // Offset based on vertical distance
          const controlY = (sourceY + targetY) / 2 + (sourceX - targetX) * 0.2; // Offset based on horizontal distance

          const normalizedOpacity = Math.pow(link.identity / 100, 3);

          // Draw the line
          this.connectionGraphics = new PIXI.Graphics();
          this.connectionGraphics.moveTo(sourceX, sourceY);
          // this.connectionGraphics.lineTo(targetX, targetY);
          this.connectionGraphics.quadraticCurveTo(controlX, controlY, targetX, targetY);
          this.connectionGraphics.stroke({ width: 1, color:  0xd3d3d3, alpha: normalizedOpacity });

          // Add source and target sequence_uid properties
          this.connectionGraphics.sourceSequenceUid = sprite.sequence_uid;
          this.connectionGraphics.targetSequenceUid = link.targetUid;

          // Add geometry 
          this.connectionGraphics.startX = sourceX;
          this.connectionGraphics.startY = sourceY;
          this.connectionGraphics.controlX = controlX;
          this.connectionGraphics.controlY = controlY;
          this.connectionGraphics.endX = targetX;
          this.connectionGraphics.endY = targetY;
          this.connectionGraphics.identityNorm = normalizedOpacity;

          // Add to the lines container
          this.linesContainer.addChild(this.connectionGraphics);
        });
      });

      }

      const canvas = this.app.canvas
      this.initializeLasso(canvas)

      this.app.render();
    },
    highlightLinks(sequence_uid, isHovered) {

      console.log('highlight links for:', sequence_uid)

      // Ensure tooltips are managed with highlights
      this.spritesContainer.children.forEach((sprite) => {
        if (sprite.sequence_uid === sequence_uid) {
            if (isHovered) {
                // console.log('hovered', sprite.sequence_id, sprite.sequence_name);
                // this.showTooltip(sprite);
                

                if (this.viewport.scale.x > 0.5) {
                    this.linesContainer.children.forEach((line) => {
                      console.log(this.linesContainer.children)
                        // Highlight lines connected to the hovered sprite
                        if (
                            line.sourceSequenceUid === sequence_uid || line.targetSequenceUid === sequence_uid
                        ) {

                            // Move the hovered line to the end of the container for rendering on top
                            this.linesContainer.removeChild(line);
                            this.linesContainer.addChild(line);

                            line.clear();
                            line.moveTo(line.startX, line.startY);
                            line.quadraticCurveTo(
                                line.controlX,
                                line.controlY,
                                line.endX,
                                line.endY
                            );
                            line.stroke({
                                width: line.linkCount || 1,
                                color: 0xb674e8, // Highlight color
                                alpha: 0.7, // Full opacity for highlighted lines
                            });
                            
                        }
                    });
                }
            } else {
                // Hide the tooltip when not hovered
                // this.hideTooltip(sequence_uid);
                // this.tooltipContainer.removeChildren(); // Clear previous connection
                // this.app.render();

                if (this.viewport.scale.x > 0.5) {
                    this.linesContainer.children.forEach((line) => {
                        // Reset all lines to their default styles, but do not remove them
                        line.clear();
                        line.moveTo(line.startX, line.startY);
                        line.quadraticCurveTo(
                            line.controlX,
                            line.controlY,
                            line.endX,
                            line.endY
                        );
                        line.stroke({
                            width: line.linkCount/5|| 1, // Default width
                            color: 0xd3d3d3, // Default color
                            alpha: 0.7, // Default opacity
                        });
                    });
                }
            }
      
        }
      });
      this.app.render();
    },
    showTooltip(sprite) {

      this.tooltipContainer.removeChildren(); // Clear previous connections

      const tooltipTextDebug = new PIXI.Text({text: sprite.sequence_id +' | '+ sprite.sequence_name});
      tooltipTextDebug.x = sprite.x + 15;
      tooltipTextDebug.y = sprite.y - 15
      tooltipTextDebug.visible = false;

      this.tooltipContainer.addChild(tooltipTextDebug)
      
      // Find the related text and background tooltips in the tooltipContainer
      // const tooltipText = this.tooltipContainer.children.find(
      //   (child) => child.sequence_uid === sequence_uid
      // );

      // const tooltipBackground = this.tooltipContainer.children.find(
      //   (child) => child.sequence_uid === sequence_uid && child instanceof PIXI.Graphics
      // );

    // Set both text and background to visible, if they exist
    if (tooltipTextDebug){
       tooltipTextDebug.scale.set(1 / this.viewport.scale.x);
      tooltipTextDebug.visible = true;

      // tooltipBackground.visible = true;

      // Adjust scale dynamically for both
      // tooltipText.scale.set(1 / this.viewport.scale.x);
      console.log(`Tooltip for sequence_uid ${sequence_uid} is now visible.`);
    } else {
      console.warn(`Tooltip for sequence_uid ${sequence_uid} not found.`);
    }
    this.app.render

  },
  hideTooltip(sequence_uid) {
    // // Find the tooltip in the tooltipContainer
    // const tooltip = this.tooltipContainer.children.find(
    //   (child) => child.sequence_uid === sequence_uid
    // );

    // // If tooltip exists, set it to invisible
    // if (tooltip) {
    //   tooltip.visible = false;
    //   console.log(`Tooltip for sequence_uid ${sequence_uid} is now hidden.`);
    // } else {
    //   console.warn(`Tooltip for sequence_uid ${sequence_uid} not found.`);
    // }
  
  },
    createCircleTextureNew(circleRadius, resolution, borderThickness) {
      const res =
        Math.max(1, window.devicePixelRatio) * (this.viewport?.scale.x || 1)
      // console.log('Generating texture with resolution:', res)

      // Adjust circle radius based on the zoom level to keep it constant
      const adjustedRadius = circleRadius / (this.viewport?.scale.x || 1);
      const adjustedBorderThickness = borderThickness * devicePixelRatio / (this.viewport?.scale.x || 1);

      // console.log('Adjusted circle radius:', adjustedRadius);
      // console.log('Adjusted border thickness:', adjustedBorderThickness);


      // Use PIXI.Graphics to draw a circle
      const graphics = new PIXI.Graphics()

      // Draw border and circle
      // const borderRadius = adjustedRadius + 0.5 * devicePixelRatio;
      const borderRadius = adjustedRadius + adjustedBorderThickness;
      const totalRadius = borderRadius;
      // const totalRadius = Math.max(borderRadius, adjustedRadius);
      const borderColor = 0x000000; // Black border
      graphics.circle(totalRadius, totalRadius, borderRadius)
      graphics.fill(borderColor)
      graphics.circle(totalRadius, totalRadius, adjustedRadius)
      graphics.fill(0xffffff)

      // Draw border and cicle
      // const borderRadius = circleRadius + 0.5 * devicePixelRatio
      // const totalRadius =
      //   borderRadius > circleRadius ? borderRadius : circleRadius
      // const borderColor = 0x000000
      // graphics.circle(totalRadius, totalRadius, borderRadius)
      // graphics.fill(borderColor)
      // // Draw the circle
      // graphics.circle(totalRadius, totalRadius, circleRadius)
      // graphics.fill(0xffffff)

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
        // width: circleRadius * 2.5,
        // height: circleRadius * 2.5,
        width: totalRadius * 2, // Adjust for border and padding
        height: totalRadius * 2,
        resolution: Math.max(
          2,
          window.devicePixelRatio * this.viewport.scale.x
        ), // Adjust resolution based on zoom
      })

      // Render the graphics to the texture
      this.app.renderer.render(graphics, {renderTexture})

      // Return both the texture and totalRadius
      return { texture: renderTexture, totalRadius };
    },
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

      // //  Reinitialize the lasso
      // this.initializeLasso(canvas)

      console.log(this.lassoInstance.items())
    },
    initializeLasso(canvas) {

      d3.select(this.$refs.lasso_umap).selectAll('g.lasso *').remove()
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
      lassoInstance.value = lasso()
        .targetArea(d3.select(canvas)) // Bind to the canvas
        .closePathDistance(150)
        .on('start', this.lassoStart)
        .on('draw', this.lassoDraw)
        .on('end', this.lassoEnd)

      // Link lasso to the sprites in the container
      lassoInstance.value.items(this.spritesContainer.children as PIXI.Sprite[])
      svg.select('g.lasso').call(lassoInstance.value)

      console.log('Lasso UMAP initialized and added.')
    },
    // createCircleTexture(circleRadius, app) {
    //   // Use PIXI.Graphics to draw a circle
    //   const graphics = new PIXI.Graphics()
    //   // Draw border
    //   const borderRadius = circleRadius + 0.5 * devicePixelRatio
    //   const totalRadius =
    //     borderRadius > circleRadius ? borderRadius : circleRadius
    //   const borderColor = 0x000000
    //   graphics.circle(totalRadius, totalRadius, borderRadius)
    //   graphics.fill(borderColor)
    //   // Draw the circle
    //   graphics.circle(totalRadius, totalRadius, circleRadius)
    //   graphics.fill(0xffffff)
    //   // Generate a texture from the Graphics object
    //   this.circleTexture = app.renderer.generateTexture(graphics)
    // },
    createCircleTexture(circleRadius, resolution, borderThickness) {
      const res =
        Math.max(1, window.devicePixelRatio) * (this.viewport?.scale.x || 1)
      // console.log('Generating texture with resolution:', res)

      // Adjust circle radius based on the zoom level to keep it constant
      const adjustedRadius = circleRadius / (this.viewport?.scale.x || 1);
      const adjustedBorderThickness = borderThickness * devicePixelRatio / (this.viewport?.scale.x || 1);

      // console.log('Adjusted circle radius:', adjustedRadius);
      // console.log('Adjusted border thickness:', adjustedBorderThickness);


      // Use PIXI.Graphics to draw a circle
      const graphics = new PIXI.Graphics()

      // Draw border and circle
      // const borderRadius = adjustedRadius + 0.5 * devicePixelRatio;
      const borderRadius = adjustedRadius + adjustedBorderThickness;
      const totalRadius = borderRadius;
      // const totalRadius = Math.max(borderRadius, adjustedRadius);
      const borderColor = 0x000000; // Black border
      graphics.circle(totalRadius, totalRadius, borderRadius)
      graphics.fill(borderColor)
      graphics.circle(totalRadius, totalRadius, adjustedRadius)
      graphics.fill(0xffffff)

      // Draw border and cicle
      // const borderRadius = circleRadius + 0.5 * devicePixelRatio
      // const totalRadius =
      //   borderRadius > circleRadius ? borderRadius : circleRadius
      // const borderColor = 0x000000
      // graphics.circle(totalRadius, totalRadius, borderRadius)
      // graphics.fill(borderColor)
      // // Draw the circle
      // graphics.circle(totalRadius, totalRadius, circleRadius)
      // graphics.fill(0xffffff)

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
        // width: circleRadius * 2.5,
        // height: circleRadius * 2.5,
        width: totalRadius * 2, // Adjust for border and padding
        height: totalRadius * 2,
        resolution: Math.max(
          2,
          window.devicePixelRatio * this.viewport.scale.x
        ), // Adjust resolution based on zoom
      })

      // Render the graphics to the texture
      this.app.renderer.render(graphics, {renderTexture})

      // Return both the texture and totalRadius
      return { texture: renderTexture, totalRadius };
    },

    createReverseLookup(lookup) {
      const reverseLookup = {}

      for (const uid in lookup) {
        const index = lookup[uid]
        reverseLookup[index] = uid
      }

      return reverseLookup
    },
    drawSequenceSprite(x, y, index, labels, sequencePropertiesLookup) {
      const circleSprite = new PIXI.Sprite(circleTexture.value);

 
      // Check if this sequence is part of the selectedSequencesLasso
      const isSelected = this.genomeStore.selectedSequencesLasso.includes(labels[index]);
      circleSprite.tint = isSelected ? 0x007bff : 0xd3d3d3; // Blue if selected, gray otherwise
      circleSprite.alpha = 0.5;
      circleSprite.index = index
      circleSprite.sequence_uid = labels[index]

      circleSprite.sequence_name = sequencePropertiesLookup.get(labels[index]).name
      circleSprite.sequence_id = sequencePropertiesLookup.get(labels[index]).id


      circleSprite.x = x;
      circleSprite.originalX = x;
      circleSprite.y = y;

      circleSprite.interactive = true;


   
       // Add interactivity for tooltip and highlighting
        circleSprite.on('mouseover', () => {
          this.highlightLinks(circleSprite.sequence_uid, true); // Highlight links
        });

        circleSprite.on('mouseout', () => {
          this.highlightLinks(circleSprite.sequence_uid, false); // Reset links
        });

      // Add interactivity for command/control key + click
      circleSprite.on('pointerdown', (event) => {
        if (event.originalEvent.metaKey || event.originalEvent.ctrlKey) {
          console.log('control or command pressed')
          event.stopPropagation();
          // Check if the sprite is already selected
          const isAlreadySelected = this.genomeStore.selectedSequencesLasso.includes(circleSprite.sequence_uid);

          if (!isAlreadySelected) {
            // Add to lasso selection
            this.genomeStore.selectedSequencesLasso.push(circleSprite.sequence_uid);

            // Update sprite appearance
            circleSprite.tint = 0x007bff; // Highlight color for selected
            circleSprite.alpha = 0.8; // Slightly more opaque

            console.log(`Added ${circleSprite.sequence_uid} to lasso selection.`);
          } else {
            console.log(`${circleSprite.sequence_uid} is already selected.`);
          }

          // Trigger Vue reactivity for `selectedSequencesLasso`
          this.genomeStore.setSelectedSequencesLasso([...this.genomeStore.selectedSequencesLasso]);

          this.initializeLasso(this.app.canvas)
          // Re-render
          this.app.render();

        }
      });

      // this.viewport.addChild(circleSprite);
      // Add the sprite to spritesContainer
      this.spritesContainer.addChild(circleSprite);
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
      if (this.isShiftPressed.value === true) {
        console.log('Skipping UMAP lasso start due to Shift key being pressed.')
        return
      }

      const genomeStore = useGenomeStore()
      console.log('UMAP Lasso selection started', genomeStore.selectedSequencesLasso)
      const trackerUids = genomeStore.selectedSequencesTracker

      // Filter the sprites in lassoInstance based on sequence_uids in tracker
      const trackedSprites = lassoInstance.value.items().filter((sprite) => {
        return trackerUids.has(sprite.sequence_uid) // Check if sprite's UID is in the tracker
      })

      // // Apply different tint to sprites in the tracker
      // trackedSprites.forEach((sprite) => {
      //   sprite.tint = 0xa9a9a9 // darker tint for previously selected sprites
      //   sprite.alpha = 0.5 // Set opacity to 50%
      // })
      if (trackedSprites) {
       trackedSprites.forEach((sprite) => {
          if (!trackerUids.has(sprite.sequence_uid)) {
            sprite.tint = 0xd3d3d3 // default tint for unmatched sprites
            sprite.alpha = 0.5 // Set opacity to 50%
          }
        })
      }
    },
    lassoDraw() {
      if (this.isShiftPressed.value === true) {
        console.log('Skipping lasso draw due to Shift key being pressed.')
        return
      }
    },
    lassoEnd() {

      if (this.isShiftPressed.value === true) {
        console.log('Skipping lasso end due to Shift key being pressed.')
        return
      }
      console.log('lasso end')

      var selectedSprites = []

      // Get the device pixel ratio
      const dpr = window.devicePixelRatio || 1;

      const dyn_path = d3
        .select(this.$refs.lasso_umap)
        .select('g.lasso')
        .select('g.lasso')
        .select('path.drawn')

      const lassoPath = dyn_path.attr('d') // Get the current lasso path
      console.log('Lasso path data at end:', lassoPath)
      // Extract original lasso points
      const parsedData = parseSVG(lassoPath);

        // Extract coordinates
        const lassoPoints = parsedData
          .filter((command) => command.code === 'M' || command.code === 'L') // MoveTo or LineTo commands
          .map((command) => [command.x * dpr , command.y * dpr]);

        console.log('Lasso Points:', lassoPoints);


        // checking matrices 
        lassoInstance.value.items().forEach((sprite) => {
        // Get the sprite's position in the original data space using groupTransform
        const { x: itemX, y: itemY } = sprite;
        const { tx: spriteXl, ty: spriteYl } = sprite.localTransform
        const { tx: spriteX, ty: spriteY } = sprite.groupTransform
        const { tx: spriteXr, ty: spriteYr } = sprite.relativeGroupTransform
        const { tx: spriteXw, ty: spriteYw } = sprite._worldTransform

           // Create a point array for the sprite
           const spritePoint = [spriteXw * dpr, spriteYw * dpr];
        const lassoPointsDpr = lassoPoints.map(([x, y]) => [x * dpr, y * dpr]);

        // Check if the point lies within the lasso polygon
        const selected = this.isPointInPoly(lassoPointsDpr, spritePoint, dpr);
        if (selected){
          sprite.tint = 0x007bff
          selectedSprites.push(sprite.sequence_uid)
          // selectedItemsGroupTransform.push(sprite)
        }
        else{
          
          sprite.tint = 0xd3d3d3
        }
      });

      this.app?.render()

      console.log('Selected sprites:', selectedSprites)
      globalSelectedSprites.value = selectedSprites
      this.selectedSprites = selectedSprites
      const genomeStore = useGenomeStore()
      genomeStore.setSelectedSequencesLasso(selectedSprites)
    },
    isPointInPoly(polygon, point) {

      // Scale the point by the devicePixelRatio
      const [px, py] = [point[0], point[1]];
      let isInside = false;

      // Iterate through the polygon edges
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        // Scale polygon points by the devicePixelRatio
        const [xi, yi] = [polygon[i][0], polygon[i][1]];
        const [xj, yj] = [polygon[j][0], polygon[j][1]];

        // Check if the point is between the y-coordinates of the edge
        const intersect =
          yi > py !== yj > py &&
          px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

        if (intersect) isInside = !isInside;
      }

      return isInside;
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

canvas {
  outline: none; /* Removes blue border on focus */
}
</style>

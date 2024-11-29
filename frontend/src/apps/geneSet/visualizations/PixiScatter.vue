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
import { parseSVG } from 'svg-path-parser';

const globalSelectedSprites = ref<string[]>([])
// to-do: need to use these again:
const circleTexture = ref<PIXI.Texture>()
const lassoInstance = ref<lasso>()

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

// PIXI.Sprite.prototype.getBoundingClientRect = function () {
//   const devicePixelRatio = window.devicePixelRatio || 1;

//   // Get the viewport's transformation matrix
//   const viewportTransform = this.parent.worldTransform || { tx: 0, ty: 0, a: 1, d: 1 };
//   const { tx, ty, a: scaleX, d: scaleY } = viewportTransform;

//   // Adjust sprite's position and size according to translation and scaling
//   const left = (this.x * scaleX + tx - this.width * scaleX) / 4* devicePixelRatio
//   const top = (this.y * scaleY + ty - this.height * scaleY) / 4* devicePixelRatio;
//   const adjustedWidth = this.width * scaleX / devicePixelRatio;
//   const adjustedHeight = this.height * scaleY / devicePixelRatio;

//   console.log('PIXI.Sprite.prototype.getBoundingClientRect', left, top, adjustedWidth, adjustedHeight)

//   return {
//     left,
//     top,
//     width: adjustedWidth,
//     height: adjustedHeight,
//   };
// };



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
        const isShiftPressed = ref(false)
        this.isShiftPressed = isShiftPressed
        console.log(isShiftPressed.value)
        const focusContainer = this.$refs.focusContainer;

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
          resolution: 3,
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

        const onFocusCanvas = () => {
          console.log('Canvas focused, keyboard events will be captured')

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
            console.log('Removing lasso.')

            // Clear lasso paths
            d3.select(this.$refs.lasso).selectAll('path').remove()
            d3.select(this.$refs.lasso).selectAll('circle').remove()
          }
          console.log(
            '*** key shift pressed from canvas focus',
            this.isShiftPressed.value
          )
        }

        const onKeyUp = (event: KeyboardEvent) => {
          if (event.key === 'Shift') {
            this.isShiftPressed.value = false
            console.log(
              '*** key shift NOT pressed from canvas focus',
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
            console.log('Canvas blurred, keyboard events ignored');
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
          if (zoomLevel > 2) {
            // Draw connections if zoom level is high enough
            this.drawConnections();
          } else {
            // Hide connections by clearing the linesContainer
            this.linesContainer.visible = false; // Hide instead of removing children
          }

          // Ensure visibility of linesContainer at higher zoom levels
          if (zoomLevel > 2 && !this.linesContainer.visible) {
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

        // // Create a foreground container for hover texts
        // const foregroundContainer = new PIXI.Container()
        // const circleContainer = new PIXI.Container()
        // this.circleContainer = circleContainer

        // app.stage.addChild(circleContainer)
        // this.viewport.addChild(circleContainer)

        this.drawGrid()
        this.drawTooltips();
        // this.drawConnections();



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
            // this.drawConnections();
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
        this.$emit('canvasSize', {
          width: this.app.renderer.width,
          height: this.app.renderer.height,
        });
      } catch (error) {
        console.error('Error initializing Pixi.js:', error)
      }
    })
  },
  methods: {
    showTooltip(sequence_uid) {
     
        // Find the related text and background tooltips in the tooltipContainer
      const tooltipText = this.tooltipContainer.children.find(
        (child) => child.sequence_uid === sequence_uid && child instanceof PIXI.Text
      );

      // const tooltipBackground = this.tooltipContainer.children.find(
      //   (child) => child.sequence_uid === sequence_uid && child instanceof PIXI.Graphics
      // );

      // Set both text and background to visible, if they exist
      if (tooltipText){
        tooltipText.visible = true;
        // tooltipBackground.visible = true;

        // Adjust scale dynamically for both
        tooltipText.scale.set(1 / this.viewport.scale.x);
        console.log(`Tooltip for sequence_uid ${sequence_uid} is now visible.`);
      } else {
        console.warn(`Tooltip for sequence_uid ${sequence_uid} not found.`);
      }
   
    },
    debugTooltips() {
      console.log('Tooltips count:', this.tooltipContainer.children.length);

      this.tooltipContainer.children.forEach((tooltip, index) => {
        console.log(`Tooltip ${index}:`, {
          x: tooltip.x,
          y: tooltip.y,
          visible: tooltip.visible,
          text: tooltip.text,
          alpha: tooltip.alpha,
        });
      });
    },
    hideTooltip(sequence_uid) {
      // Find the tooltip in the tooltipContainer
      const tooltip = this.tooltipContainer.children.find(
        (child) => child.sequence_uid === sequence_uid
      );

      // If tooltip exists, set it to invisible
      if (tooltip) {
        tooltip.visible = false;
        console.log(`Tooltip for sequence_uid ${sequence_uid} is now hidden.`);
      } else {
        console.warn(`Tooltip for sequence_uid ${sequence_uid} not found.`);
      }
    },
    highlightLinks(sequence_uid, isHovered) {

      console.log('highlight links for:', sequence_uid)

        // Ensure tooltips are managed with highlights
        this.spritesContainer.children.forEach((sprite) => {
          if (sprite.sequence_uid === sequence_uid) {
            if (isHovered) {
              console.log('hovered', this.tooltipContainer.children)
              this.showTooltip(sequence_uid);


         

              if (this.viewport.scale.x > 2) {
                this.linesContainer.children.forEach((line) => {
                  if (line.sourceSequenceUid === sequence_uid) {
                    line.clear();
                    line.moveTo(line.startX, line.startY);
                    line.quadraticCurveTo(line.controlX, line.controlY, line.endX, line.endY);
                    line.stroke({ width: 2, color: 0xb674e8, alpha: line.identityNorm }); // Highlighted line
                  } else {
                    line.clear();
                    line.moveTo(line.startX, line.startY);
                    line.quadraticCurveTo(line.controlX, line.controlY, line.endX, line.endY);
                    line.stroke({ width: 1, color: 0xd3d3d3, alpha: line.identityNorm }); // Default line
                  }
                });
              }
            } else {

              // Hide the tooltip when not hovered
              this.hideTooltip(sequence_uid);

              if (this.viewport.scale.x > 2) {
                this.linesContainer.children.forEach((line) => {
                  if (line.sourceSequenceUid === sequence_uid) {
                    line.clear();
                    line.moveTo(line.startX, line.startY);
                    line.quadraticCurveTo(line.controlX, line.controlY, line.endX, line.endY);
                    line.stroke({ width: 1, color: 0xd3d3d3, alpha: line.identityNorm }); // Reset line
                  }
                });
              }
            }
          }
        });
      },


    //   if (this.viewport.scale.x > 2) {

    //     const hoveredLines = [];
    //     const nonHoveredLines = [];

    //     if (isHovered === true){
    //     console.log('highlight links true', this.linesContainer.children)
    //     this.linesContainer.children.forEach((line) => {
    //       // console.log(line.sourceSequenceUid, sequence_uid)
    //       if (line.sourceSequenceUid === sequence_uid) {
    //         console.log('source sequence uid', line.startX, line.startY, line.controlX, line.controlY, line.endX, line.endY)

    //         line.clear();
    //         // Redraw the line
        
    //         line.moveTo(line.startX, line.startY);
    //         line.quadraticCurveTo(line.controlX, line.controlY, line.endX, line.endY);
    //         line.stroke({width: 2, color: 0xb674e8, alpha: line.identityNorm});
    //         hoveredLines.push(line);
       
    //         }
    //         else {
    //           line.clear();
    //           line.moveTo(line.startX, line.startY);
    //           line.quadraticCurveTo(line.controlX, line.controlY, line.endX, line.endY);
    //           line.stroke({width:1, color: 0xd3d3d3, alpha: line.identityNorm});
    //           nonHoveredLines.push(line);
    //         }
    //     });

    //     // Clear the container
    //     this.linesContainer.removeChildren();

    //     // Re-add non-hovered lines first, then hovered lines (to render them on top)
    //     nonHoveredLines.forEach((line) => this.linesContainer.addChild(line));
    //     hoveredLines.forEach((line) => this.linesContainer.addChild(line));

    //     // Re-render to update the visuals
    //     this.app.render();

    //     }
    //   }
    // },
    drawSequenceSprite(sequence, x, y, radius) {
      const circleSprite = new PIXI.Sprite(circleTexture.value);

      // Check if this sequence is part of the selectedSequencesLasso
      const isSelected = this.genomeStore.selectedSequencesLasso.includes(sequence.uid);
      circleSprite.tint = isSelected ? 0x007bff : 0xd3d3d3; // Blue if selected, gray otherwise
      circleSprite.alpha = 0.5;
      circleSprite.sequence_uid = sequence.uid;
      circleSprite.sequence_id = sequence.id

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


      // this.viewport.addChild(circleSprite);
      // Add the sprite to spritesContainer
      this.spritesContainer.addChild(circleSprite);
    },
    drawConnections() {

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



      // // Collect all circle positions
      // const circlePositions = [];
      // this.viewport.children.forEach((sprite) => {
      //   const spriteLinks = this.genomeStore.sequenceHomologyLinks

      //   console.log('sprite', sprite.sequence_uid, sprite.totalRadius, spriteLinks[sprite.sequence_uid])
      //   debugger;

      //   if (sprite.sequence_uid) {
      //     sprite.homologyLinks = spriteLinks[sprite.sequence_uid]
      //     // const { tx: spriteXw, ty: spriteYw } = sprite._worldTransform
      //     const spriteXw = sprite.x + sprite.totalRadius
      //     const spriteYw = sprite.y + sprite.totalRadius
      
      //     // const { x: spriteXw, y: spriteYw } = sprite


      //     circlePositions.push({ spriteXw, spriteYw });
          
      //   }
    
      // });

      // // console.log('circlePositions', circlePositions)

      // // Draw lines between all pairs of circles
      // for (let i = 0; i < circlePositions.length; i++) {
      //   for (let j = i + 1; j < circlePositions.length; j++) {
      //     const start = circlePositions[i];
      //     const end = circlePositions[j];

      //     // Draw a line between each pair of circles
      //     this.connectionGraphics.moveTo(start.spriteXw, start.spriteYw);
      //     this.connectionGraphics.lineTo(end.spriteXw, end.spriteYw);
      //     this.connectionGraphics.stroke({ width: 1, color: 0x00FF00, alpha: 0.2 });
      //   }
      // }

      // // Draw lines between all sequences
      // for (let i = 0; i < circlePositions.length - 1; i++) {
      //   const start = circlePositions[i];
      //   const end = circlePositions[i + 1];

      //   // Draw a line between each pair of circles
      //   this.connectionGraphics.moveTo(start.spriteXw, start.spriteYw);
      //   this.connectionGraphics.lineTo(end.spriteXw, end.spriteYw);
      //   this.connectionGraphics.stroke({ width: 1, color: 0x00FF00 });
      // }
      
      // this.viewport.addChild(this.connectionGraphics);

      const canvas = this.app.canvas
      this.initializeLasso(canvas)

      this.app.render();
    },


    drawTooltips() {
      console.log('Drawing tooltips');

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

        // Create a tooltip for the sprite
        const tooltipText = new PIXI.Text({text: sprite.sequence_id, style:{
          fontFamily: 'Arial',
          fontSize: 12 * window.devicePixelRatio * this.viewport.scale.x,
          fill: 0x000000, 
          align: 'center',
        }});

        // const tooltipBackground = new PIXI.Graphics();
        // const padding = 4; // Padding around the text

        // tooltipBackground.rect(
        //   sprite.x + 15,
        //   sprite.y,
        //   tooltipText.width + padding * 2,
        //   tooltipText.height + padding * 2
        // );
        // tooltipBackground.fill({color:0x00FF00, alpha:0.9}); // White with slight transparency

        // // // Position the background behind the text
        // tooltipBackground.x = sprite.x + 15; // Offset horizontally
        // tooltipBackground.y = sprite.y
        // tooltipBackground.visible = false; // Start hidden
        // tooltipBackground.scale.set(1 / this.viewport.scale.x); // Scale proportionally

        // Set the tooltip's position relative to the sprite
        // tooltip.anchor.set(0.5, 1); // Center horizontally, position above the sprite
        tooltipText.x = sprite.x + 15;
        tooltipText.y = sprite.y
        tooltipText.visible = false; // Start hidden
        tooltipText.sequence_uid = sprite.sequence_uid
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

      // /////// previous with only viewport //////////
      // if (!this.viewport) {
      //   console.error('Viewport is not initialized.')
      //   return
      // }

      // // Clear the viewport
      // this.viewport.removeChildren()
      // ///////////////

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
      const circleSpacing = (2 * circleRadius) / devicePixelRatio
      const genomeGap = 20 * devicePixelRatio // Extra gap between genomes
      const zoomLevel = this.viewport.scale.x
      const resolution = window.devicePixelRatio * zoomLevel

      // Create the circle texture
      const { texture, totalRadius } = this.createCircleTexture(circleRadius, resolution, 0.5)
      circleTexture.value = texture
      // circleTexture.value = this.createCircleTexture(circleRadius, resolution, 0.5)

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

        // Determine which data structure to use
      const genomes = filterEmpty
        ? this.genomeStore.filteredGenomes // Map or Object with key-value pairs
        : this.genomeStore.genomeData.genomes; // Array of objects

      // Iterate over the selected genome structure
      if (filterEmpty) {
        // `filteredGenomes` is a Map or object with keys as genome UIDs
        Object.entries(genomes).forEach(([genomeUid, sequences]) => {
          console.log('Drawing genome:', genomeUid);

          sequences.forEach((sequence, index) => {
            this.drawSequenceSprite(sequence, currentX, currentY, circleRadius);

            // Update grid position
            currentX += 2 * circleRadius + circleSpacing;

            // Wrap to the next row if maxCols is reached
            if ((index + 1) % maxCols === 0) {
              currentX = padding;
              currentY += 2 * circleRadius + circleSpacing;
            }
          });

          // Add gap for the next genome
          currentX = padding;
          currentY += genomeGap;
        });
      } else {
        // `genomeData.genomes` is an array of objects
        genomes.forEach((genome) => {
          console.log('Drawing genome:', genome.uid);

          genome.sequences.forEach((sequence, index) => {
            this.drawSequenceSprite(sequence, currentX, currentY, circleRadius);

            // Update grid position
            currentX += 2 * circleRadius + circleSpacing;

            // Wrap to the next row if maxCols is reached
            if ((index + 1) % maxCols === 0) {
              currentX = padding;
              currentY += 2 * circleRadius + circleSpacing;
            }
          });

          // Add gap for the next genome
          currentX = padding;
          currentY += genomeGap;
        });
      }
      // this.app.stage.addChild(this.viewport)

      this.app.render()

      //  Reinitialize the lasso
      if (!this.isDragging) {
        this.initializeLasso(canvas)
      }

      // console.log(this.lassoInstance.items())
    },
    initializeLasso(canvas) {

      d3.select(this.$refs.lasso).selectAll('g.lasso *').remove()
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
      lassoInstance.value = lasso()
        .targetArea(d3.select(canvas)) // Bind to the canvas
        .closePathDistance(150)
        // .scale(this.viewport.scale.x)
        // .translation({
        //   x: this.viewport.worldTransform.tx,
        //   y: this.viewport.worldTransform.ty,
        // })
        .on('start', this.lassoStart)
        .on('draw',this.lassoDraw)
        .on('end', this.lassoEnd)

      // Link lasso to the sprites in the container
      // lassoInstance.value.items(this.viewport.children as PIXI.Sprite[])
      lassoInstance.value.items(this.spritesContainer.children as PIXI.Sprite[])
      svg.select('g.lasso').call(lassoInstance.value)

      console.log('Lasso initialized and added.')
    },
    lassoStart() {
      if (this.isShiftPressed.value === true) {
        console.log('Skipping lasso start due to Shift key being pressed.')
        return
      }

      const genomeStore = useGenomeStore()
      console.log('Lasso selection started', genomeStore.selectedSequencesLasso)
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
        .select(this.$refs.lasso)
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
  

      // console.log('Bounding Box:', boundingBox);
      // console.log('dpr', dpr)
      // console.log(
      //     `Sprite at (${itemX}, ${itemY})`
      //   );
      //   console.log(
      //     `Sprite group at (${spriteX}, ${spriteY})`
      //   );
      //   console.log(
      //     `Sprite local at (${spriteXl}, ${spriteYl})`
      //   );
      //   console.log(
      //     `Sprite relative at (${spriteXr}, ${spriteYr})`
      //   );
      //   console.log(
      //     `Sprite world at (${spriteXw}, ${spriteYw})`
      //   );

         
        // // For bebugging: Compute the bounding box, scaled for devicePixelRatio
        // const boundingBox = lassoPoints.reduce(
        //   (box, [x, y]) => ({
        //     minX: Math.min(box.minX, x * dpr),
        //     minY: Math.min(box.minY, y * dpr),
        //     maxX: Math.max(box.maxX, x * dpr),
        //     maxY: Math.max(box.maxY, y * dpr),
        //   }),
        //   { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
        // );

        // // Check if sprite is inside the bounding box
        // const isInBoundingBox =
        // spriteXw * dpr >= boundingBox.minX &&
        // spriteXw * dpr <= boundingBox.maxX &&
        // spriteYw * dpr >= boundingBox.minY &&
        // spriteYw * dpr <= boundingBox.maxY;

        // if (isInBoundingBox) {
        //   console.log(`Sprite at (${spriteXw * dpr}, ${spriteYw * dpr}) is within bounding box`);
        // } else {
        //   console.log(`Sprite at (${spriteXw * dpr}, ${spriteYw * dpr}) is outside bounding box`);
        // }

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

      //   console.log(
      //   `Sprite at (${spriteXw * dpr}, ${spriteYw * dpr}) is ${
      //     selected ? 'inside' : 'outside'
      //   } the lasso`
      // );

      });

      this.app?.render()
      // debugger;

      // const boolSprites = lassoInstance.value.items().map(x => x.__lasso.selected);
      // console.log('boolSprites', boolSprites)
      // const selectedSprites = lassoInstance.value.items().filter((sprite, index) => boolSprites[index] === true).map(
      // (sprite) => sprite.sequence_uid
      // );
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
      if (!circleTexture.value) {
        console.error('Circle texture is not created.')
        return
      }

      // Create a sprite using the circle texture
      const circleSprite = new PIXI.Sprite()
      // Assign the texture
      circleSprite.texture = circleTexture.value

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

.ant-card-head {
  pointer-events: none; /* Prevent header from triggering events */
}

.child-container {
  flex: 1; /* This will make it inherit the available width */
  width: 100%; /* Ensures full width */
  height: calc(100% - 40px);
  pointer-events: auto;
  position: relative;
}

.focus-container {
  position: relative; /* Position relative to card body */
  width: 100%; /* Match the card body */
  height: calc(100% - 40px); /* Exclude the card header */
  outline: none; /* Prevent default outline */
}

canvas {
  top: 0;
  left: 0;
  width: 100%; /* Fill the container */
  height: 100%; /* Fill the container */
  pointer-events: auto;
  z-index: 10;
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

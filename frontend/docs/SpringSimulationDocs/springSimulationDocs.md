This folder contains documentation of the basic workings of the spring simulation

Pseudocode for how the nodes are updated each round can be found in "springSimulationConcept.jpg"

The connections between nodes are illustrated in "nodeConnectionAssignment.jpg"

Breakdown of all the forces that apply to a node can be found in files named Media(16-17).jpg.
All forces that are drawn are acting on the "current node" which is denoted by a square. The forces 
originate from the node that they are drawn closest to. 

# Basic function of the simulation

All nodes are updated simultaneously, independent of the other nodes' changes in the current update round.
For each node, all forces acting on it are evaluated and multiplied by a weight before being summed to 
form the total force on the node. 

The force is scaled with a local temperature of the node that is
designed to dampen oscillations. The scaled force is assigned as the change in position 
for the node. The change's magnitude is restricted to maintain node order and ensure stability
of the simulation. The restrictions are made more strict as the temperature decreases (i e 
as the simulation runs). 

The restricted changes are applied to each of the nodes. The updated nodes are checked to 
maintain the minimum distance (touching distance) between them. 

The largest change in position within the round is compared with an end criterion, and the 
resulting nodes and termination condition are returned.

# Specific features

## Node grouping

To ensure that the length of all genes are kept intact, the scaling can only take place
where there are no genes/mRNAs on the current sequence.

Before the simulation, each node (GraphNode) is assigned to a node group (GraphNodeGroup), 
which corresponds to a stretch of the genome with continous coverage of features ( i e an
area that is frozen and can not be stretched or compressed).

The simulation is run on the node groups, and the end result is transformed back into 
the individual nodes for the model to plot. 

## Forces

There are (currently) five types of forces that act on each node. 

The four calculated by evaluateForces:
    - dnaStringForce
    - gravityForce
    - repellingForce
    - homologyGroupForce (yForce)
And the one by findNormalForces
    - normalForce


dnaStringForce strives to maintain the original distance between nodes

gravityForce strives to contract neighbouring nodes

repellingForce strives to spread out neighbouring nodes

homologyGroupForce strives to contract (in the x direction) nodes of the same homology group (yConnections)

normalForce calculates what forces are applied by neighbouring nodes that are within the 
minimumDistance and thus counts as if they are touching the node. The calculation takes
all nodes that are connected to the current node by touching it or a touching neighbour.
Only forces in the direction of the current node are applied (i.e. nodes do not stick together once
they touch)


## Constraints

When forces have been calculated the movement of a node is subject to multiple restraints.

 - normal forces / collisions
 - maximum move
 - order constraint
 - minimum distance

 ### normal forces
 If a node is in contact with another node (distance < minimumDistance), it is not possible
 to move in the direction of that node. If the force is in that direction it is set to zero.

 ### maximum move 
 There is a maximum allowed step size that decreases with the heat. The heat decreases as the
 simulation runs, so larger steps are allowed in the beginning of the simulation.

 ### order constraint
 To avoid that nodes swap places, they may only move 3/7 of the distance to their neighbour.
 This ensures that two nodes can not change order.

 ### minimum distance
 A minimum distance (touching distance) should be maintained between nodes. Since all nodes
 are updated simultaneously this is difficult to accomplish in the calculation of the 
 node move. Therefore, when all new positions are calculated the distance between each node
 and its *left* neighbour is controlled and the position of the current node and all
 subsequent nodes are shifted to the *right* if the minimum distance is not maintained.




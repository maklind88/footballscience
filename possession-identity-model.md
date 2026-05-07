# Possession Identity Model

This note is the working football model behind the simulator's in-possession autopilot. It is not a UI spec. It is the coaching logic we should keep using when we turn team identity into decisions, movements and realistic action chains.

## Core References

- User principle source: see `principle-taxonomy.md`, translated from `Phases and Principles for tagging.xlsx`.
- Research implementation layer: see `elite-principle-engine-research.md` for the principle-chain model now being used by the autopilot.
- FIFA Training Centre frames in-possession football as team actions plus individual actions: width and depth, breaking lines, switching play, overloads, central/wide attacks, finishing, receiving, running with the ball, take-ons, passing and shooting.
- FIFA's build-up material emphasises purposeful possession, support angles, open body shape, first touch to break lines, goalkeeper involvement, full-backs as wide outlets and centre-backs carrying when the pass lane is blocked.
- FIFA's switching-play and wide-area material highlights weak-side recognition, width/depth before the switch, underlaps/overlaps after the switch, and box occupation after wide progression.
- Coaches' Voice formation analysis supports using formation as a starting framework, not a fixed shape. The in-possession shape is the behaviour that emerges from roles, rotations and opponent pressure.

## Possession Principles For The Simulator

1. Possession is not just passing. It is a repeated cycle of secure, attract, release, progress and finish.
2. The ball should not bounce instantly between players unless the style demands high tempo and the receiver is under pressure.
3. A receiver should usually need one of three behaviours before the next action: secure touch, carry into space, or bounce pass under pressure.
4. Width is a job, not a location. Depending on formation, width can belong to wingers, full-backs or wing-backs.
5. Depth must exist both ahead and behind the ball. The simulator needs forward runners, underneath support and rest-defence at the same time.
6. A pass choice should be judged by what it changes: does it break a line, switch the point of attack, create a 2v1, access a free player, or only recycle?
7. The same team identity should behave differently in build-up, progression, final third and transition.

## Principle Chains

### Wide Entry To Overlap

Research anchor:
- Wide attacks work best when the team already has width and depth, because that stretches the block before the ball arrives.
- A high winger receiving wide should not be treated as an isolated magnet. The nearest FB/WB must read that as a trigger to overlap outside, while the closest 8/10 or 6 stays available underneath.
- The next action should normally be one of four football actions: release the overlap, combine inside, carry at the defender, or deliver/cut back if the box is occupied.

Simulator behaviour:
- If a W receives high and wide, the same-side LB/RB/WB becomes the preferred timed runner if the team's identity supports width or overlap.
- The runner targets the outside channel just beyond the W, not the same lane as the W.
- Auto decision-making gives this chain a score boost, especially in 4-3-3, 4-2-3-1 and 3-4-3.
- The model should avoid forcing the overlap every time. If the runner is too far, the lane is blocked, or the receiver is under strong pressure, the winger can still secure, combine inside, carry, cross or switch.

## Possession Rhythm Targets

- Balanced possession should sit around the general benchmark of 8-9 seconds per possession sequence.
- Control Possession and Tiki-Taka should be allowed longer chains, closer to 12 seconds, with more recycle actions before the model demands progression.
- Vertical Play, Counter Attack and Direct Transition should move through the pitch faster, usually closer to 6-8 seconds before a line break, carry or shot becomes preferred.
- Route One is the shortest rhythm: territory, second ball and immediate support matter more than long circulation.
- Kick-off starts as a controlled reset home first, then the team identity decides the next pattern.

## Formation Identity In Possession

### 4-3-3

Natural identity:
- Best base for possession because the midfield three creates passing triangles and central overloads.
- Wingers should either hold width or pin high, while full-backs choose whether to overlap, underlap or support underneath.
- The single 9 can become isolated, so the 8/10s and wide forwards must connect around them.

Simulator behaviour:
- Build-up: CBs and 6 create first-line security; 8/10 offer diagonal lanes.
- Progression: Wingers hold enough width to stretch, 8/10 receive between lines, FBs support wide.
- Final third: Wingers attack outside-to-inside or isolate 1v1; FBs create second wide option.
- Risk: too many passes into the front three can create ping-pong if the 6/8/10 are not reused.

### 4-1-4-1

Natural identity:
- Defensive starting shape that often becomes a 4-3-3 in longer possession.
- The 6 protects the centre and can briefly create a double pivot if an 8 drops.
- Wide midfielders start deeper than front-three wingers, so they often need to carry or make longer forward runs.

Simulator behaviour:
- Build-up: one 8 can drop next to the 6; wide midfielders should not start too high.
- Progression: wide midfielder receives, carries and combines with FB; central 8s make penetrative runs.
- Final third: becomes closer to 4-3-3 with W players higher and one 8/10 attacking the box.
- Risk: lone 9 isolation unless support runs arrive early.

### 3-4-3

Natural identity:
- Back three gives build-up security.
- Wing-backs provide the main width.
- Front three can be wide and pin the back line, or narrower with two players between the lines.

Simulator behaviour:
- Build-up: three CBs plus GK can overload the first line; double pivot protects underneath.
- Progression: WB must be true width. W players can either pin or come inside as 10s.
- Final third: WB + W can create wide overloads, or W can attack inside while WB delivers.
- Risk: if W and WB both move into the same lane, the wing-back gets isolated and the centre becomes crowded.

### 4-4-2

Natural identity:
- Strong counter-attacking base and constant occupation of both centre-backs.
- Not naturally ideal for long possession because two central midfielders can be outnumbered.
- Needs movements from a striker dropping, wide midfielder narrowing, or full-back advancing to create passing lanes.

Simulator behaviour:
- Build-up: one striker can drop as 10, one stays high.
- Progression: wide midfielders are main outlets; FB supports but must not always overlap.
- Final third: two strikers attack different lines, wide players deliver earlier.
- Risk: flat vertical lines cause blocked passing lanes and predictable wide-to-cross patterns.

### 4-2-3-1

Natural identity:
- Double pivot gives protection and lets FBs attack.
- The 10 is the main connector between build-up and creation.
- Wide players can roll inside to open lanes for FBs.

Simulator behaviour:
- Build-up: double pivot offers two underneath options; CBs should find 6/8 or FB.
- Progression: 10 receives between lines, W can invert, FB can overlap.
- Final third: 10 should create, combine or carry; FB/W relationship drives wide attacks.
- Risk: double pivot can leave too few players attacking central spaces if the 10 does not connect.

### 3-5-2

Natural identity:
- Back three gives secure first-line overload.
- Three central midfielders plus two wing-backs create both central numbers and width.
- Two strikers occupy both centre-backs and combine centrally.

Simulator behaviour:
- Build-up: back three plus GK can attract pressure and find midfield.
- Progression: CMs draw opponents inside before spreading to WB.
- Final third: WB delivers; two strikers and one midfielder attack box zones.
- Risk: wing-backs carry huge responsibility and can become isolated if nearest CM does not support.

## Style Identity In Possession

### Balanced

Decision logic:
- No extreme bias.
- Keep one short option, one forward option, one switch option.
- Use pass, carry and wide play based on pressure rather than forced style.

### Control Possession

Decision logic:
- Prioritise secure ball circulation with clear forward purpose.
- More use of 6/8/10 and support behind the ball.
- Switch only when one side is congested or weak side is clearly free.
- Carry after receiving if no progressive pass is worth it.

Avoid:
- Endless front-line passing.
- Too many vertical passes into the striker with no third-player support.

### Tiki-Taka

Decision logic:
- Shorter connections, third-player combinations, fast support angles.
- Receiver often takes first touch to invite/escape pressure, not always forward.
- Bounce passes are allowed but only if they create a new free player.

Avoid:
- Long switches as default.
- Same two-player wall pass repeating without a third-player release.

### Fluid Combinations

Decision logic:
- More rotations between W, 8/10, FB/WB and 9.
- Wall passes, underlaps, give-and-go, receive-and-carry.
- Prioritise dynamic movement over static pass options.

Avoid:
- Players arriving at final positions too early.
- Straight-line dribbles with no supporting rotation.

### Vertical Tiki-Taka

Decision logic:
- Short support remains, but first touch and pass selection should punch forward faster.
- More line-breaking passes into 10/9/W feet with immediate third-player support.
- Carry if it draws the next line.

Avoid:
- Long hopeful balls.
- Front line receiving with no underneath support.

### Vertical Play

Decision logic:
- Look forward early but not blindly.
- Use 9, W and 10 as line-breaking targets.
- If first vertical pass is not on, recycle once then switch or carry.

Avoid:
- Repeated central balls into a marked 9.
- Direct pass after direct pass without a second-ball structure.

### Gegenpress

Decision logic:
- After regain, attack quickly with nearby runners.
- Keep players close enough for counter-press and second balls.
- More risk is acceptable if rest-defence is connected.

Avoid:
- Slow recycling after a clear regain.
- Wide players becoming too detached from counter-press distances.

### Wing Play

Decision logic:
- Move the ball to wide players in space.
- Use switches, 1v1s, overlaps, underlaps and early deliveries.
- Box occupation matters: near post, far post, central and edge.

Avoid:
- Crosses with too few runners.
- Wide player isolated without inside and outside support.

### Overlap Wide

Decision logic:
- Winger can receive inside or hold to invite pressure.
- FB/WB timing is the trigger, not automatic overlap every time.
- Use cut-backs when near byline, not only aerial crosses.

Avoid:
- FB/WB leaving too early before the pass cue.
- W and FB/WB standing in the same lane.

### Fluid Counter-Attack / Counter Attack / Direct Transition

Decision logic:
- First action after regain should identify open space, runner timing and defensive imbalance.
- Carry into open grass is valuable if it commits the next defender.
- Passes should release runners into advantage, not just move the ball forward.

Avoid:
- Immediate long ball if carrier has free space to drive.
- Too many support players behind the ball when the opponent is disorganised.

### Route One

Decision logic:
- Early forward ball is valid only with striker contest, second-ball support and runners nearby.
- The target is territory plus second action, not merely completion rate.

Avoid:
- Long ball with no underneath structure.
- Repeating long balls when the first line can be played through.

## Implementation Rules For Autopilot

The simulator should calculate a possession identity score for every possible next action:

- Structure score: does the action preserve width, depth and rest-defence?
- Progression score: does it break a line, access a free player or move into a better zone?
- Connection score: does the receiver have nearby support and body orientation?
- Variety score: does it avoid repeating the same lane/role/action loop?
- Pressure score: is the action realistic under the current defensive pressure?
- Style score: does it match the team's selected attack identity?
- Formation score: does it use the formation's natural strengths?

## Turnover Realism Rules

Possession should not change owner just because a defender is nearby. The simulator should treat turnovers as event outcomes with clear triggers:

- Pass interception: the defender must have genuine access to the lane before the receiver's control zone, strong perception/timing and enough technical control to do more than brush the ball.
- Late arrival on a pass to feet: favour the receiver unless the defender is tight enough to create a true duel. This should usually become receiver control, a protected first touch, or a contested spill, not an automatic turnover.
- Dribble tackle: the defender needs contact access or lane timing. A balanced defender should not win cleanly from a loose proximity check.
- Counter-press: immediate regains should happen when the losing team has local compactness, a nearby presser and covering players. Individual pressure alone should be less reliable.
- Secure-possession moment: after a ball win or controlled reception, the owner needs a short grace window to carry/pass out unless the opponent has a decisive tackle cue.
- Long/aerial balls: higher chance of duel, second ball or loose ball. Ground passes to feet should have higher retention.

The research direction from FIFA's receiving-under-pressure and passing-under-pressure material is important here: body orientation, firm/accurate passes, receiving on the front/back foot and moving into space are the normal mechanisms for keeping the ball under pressure. Therefore the simulator should punish bad structure and bad pressure, not make every tight reception unstable by default.

The autopilot should not simply choose pass/dribble/shot. It should choose a micro-intention:

- Secure possession
- Attract pressure
- Break the next line
- Switch to weak side
- Create wide overload
- Isolate 1v1
- Release runner
- Attack box
- Rest-defence recycle
- Shoot

## Immediate Next Build Recommendation

Build a hidden `possessionGameModel` layer before changing more UI:

1. Add possession intentions.
2. Map each attack style to intention weights.
3. Map each formation to role responsibilities in build-up, progression and final third.
4. Score each autopilot action through principle chains before the final action is selected.
5. Let each autopilot action be selected from intention first, then action type second.
6. Add a stronger movement layer so support players create the next principle chain before the ball arrives.
7. Add a stronger anti-loop rule: same lane + same receiver role + no pressure should force carry, switch, recycle to pivot, or use full-back/wing-back.

## Sources Used

- FIFA Training Centre: In possession game library, width/depth, breaking lines, switching play, overloads and individual actions.
- FIFA Training Centre: Rehanne Skinner, building from the back.
- FIFA Training Centre: 8v6 switching play and creating overloads.
- FIFA Training Centre: Daniel Gygax, attacking in wide areas.
- Coaches' Voice: 4-3-3 formation, five key points.
- Coaches' Voice: Formations explained, including 4-3-3, 4-4-2, 4-2-3-1, 3-5-2 and 3-4-3.
- Coaches' Voice: 4-1-4-1 formation explained.
- Coaches' Voice: 4-2-3-1 formation key points.
- Coaches' Voice: 3-5-2 formation key points.

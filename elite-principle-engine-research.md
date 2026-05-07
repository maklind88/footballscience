# Elite Principle Engine Research Notes

This is the working research layer for making the simulator feel like modern football rather than animated magnets. It combines the user's principle taxonomy with external coaching references and should guide future code changes.

## Source Stack

- User source: `principle-taxonomy.md`, translated from `Phases and Principles for tagging.xlsx`.
- FIFA Training Centre: core principles of play across possession, out of possession and transitions.
- FIFA Training Centre transition sessions: scanning, quick support, compact reaction after loss, and immediate passing options after regain.
- FIFA Training Centre defending-as-a-unit material: pressing must be collective, timed as the ball travels, and supported by cover players.
- Coaches' Voice formation analysis: formation is only the base; realistic behaviour comes from role relationships, width, support, and phase-specific responsibilities.
- Coaches' Voice positional play: width, depth, overloads and third-player structures should be treated as rules for spacing, not cosmetic labels.

## Main Research Conclusion

The autopilot should not select an action first. It should select a football intention first, then choose the most realistic action to express it.

Bad model:

- Choose pass, dribble or shot.
- Pick the highest numerical score.
- Repeat until something happens.

Better model:

- Identify the phase.
- Identify the team's identity.
- Identify the current principle opportunity.
- Pick a principle chain.
- Pick the action that best expresses that chain.
- Move supporting players so the next action is already believable.

## Five Phases

- In Possession: build with GK, build up, creating phase, finishing phase.
- Out of Possession: high press vs GK, high press, block defending, box defending.
- Offensive Transition: attack immediately, release runners, exploit weak side or numerical advantage.
- Defensive Transition: counter-press, delay, protect centre, recover compactness.
- Set Pieces: goalkicks, free-kicks, corners, throw-ins and penalties as a fifth phase, not dead UI states.

## Principle Chains To Build Around

### Change Corridor

Trigger:

- Ball has stayed in the same lane.
- Opponent pressure has shifted ballside.
- The next same-side option does not break a line.

Simulation effect:

- Switches and diagonal passes gain value.
- Weak-side wide player, opposite FB/WB and far-side 8/10 become more alive.
- Same-lane repeat passes lose value unless pressure demands a bounce pass.

### Find The Third

Trigger:

- Carrier just received or the team has made one or two short passes.
- A 6, 8, 10 or second striker can receive with support.
- Direct pass to final line is available but risky.

Simulation effect:

- Connector roles become more valuable.
- One-touch/bounce actions are allowed only if they release a third player.
- Ping-pong between the same two players is punished unless it escapes pressure.

### Ask Question Wide

Trigger:

- W, FB or WB can receive high/wide with forward-facing support.
- Opponent full-back/wing-back can be isolated.
- Same-side runner is ready for overlap/underlap or inside combination.

Simulation effect:

- W and FB/WB relationship becomes a preferred chain in 4-3-3 and 3-4-3.
- Wide pass is not enough by itself; next movement must create the question.
- Cutback, underlap, overlap or 1v1 becomes the next likely action.

### Drive Past Press

Trigger:

- Carrier has open grass ahead.
- Pressure is late or not square-on.
- A pass would only recycle without changing the opponent.

Simulation effect:

- Dribbles become longer and smoother when there is genuine open space.
- Defensive pressure must respond with a nearest-presser plus cover, not random tackling.
- W, 8/10 and ball-carrying CBs get different carry values.

### Exit: Highest Point

Trigger:

- The 9, W or high 10 can receive beyond or between the next line.
- Supporting player is close enough to secure the second action.
- The pass is not simply a hopeful long ball.

Simulation effect:

- Vertical styles can play forward earlier.
- Control styles only use it when the receiving structure is stable.
- Route-one logic requires second-ball support before the long action is rewarded.

### Final-Third Combination

Trigger:

- Ball is in or near the attacking third.
- There is a runner, wall-pass angle, cutback lane, or shooting window.
- Box occupation exists: near-post, far-post, central and edge coverage.

Simulation effect:

- The simulator should prefer cutbacks and timed runs over hopeful straight crosses.
- Shots should increase when the ball enters a clear high-value zone.
- The action after a wide entry should feel like a finishing pattern, not another reset.

## Formation Translation

### 4-3-3

- Natural width usually comes from W.
- FB/LB/RB should support, overlap or underlap depending on W position.
- 6 stabilises, 8/10 connect, 9 pins or sets.
- Best principle chains: Find the Third, Ask Question Wide, Overlap/Underlap, Cutback zone.

### 3-4-3

- WB owns width more often than W.
- Back three gives secure circulation.
- Front three can pin wide or narrow into 10-like pockets.
- Best principle chains: Change Corridor, Ask Question Wide, Exit Highest Point, counter-press after loss.

### 4-4-2

- Two forwards occupy CBs.
- Wide midfielders and FBs create most progression.
- Central two must not be asked to dominate long possession against a midfield three without rotations.
- Best principle chains: early wide progression, second striker link, direct transition, early crosses.

### 4-1-4-1

- Defensive base with strong central protection.
- In possession it often behaves closer to 4-3-3 if wide midfielders advance.
- Single 9 needs early support from 8/10 and W.
- Best principle chains: central protection, controlled transition, support under 9, wide midfielder carry.

## Implementation Standard

Every candidate action should eventually receive these hidden scores:

- Structure: does the action keep width, depth and rest-defence?
- Progression: does it break a line, change corridor, attack space or move towards goal?
- Connection: is there a nearby next pass, runner or secure touch?
- Principle fit: does it match the team identity and phase?
- Role fit: does it use the role in a realistic way?
- Variety: does it avoid repeated same-lane, same-receiver loops?
- Pressure realism: does the ball stay with the team unless pressure is actually credible?

## First Code Layer Implemented

The first hidden principle-scoring layer should reward:

- Change corridor.
- Find the Third.
- Ask question wide.
- Exit: highest point.
- Final-third combination.
- Drive past press / attack open space.
- Find sweet spot / distance shooting.

This is intentionally a scoring layer first. The next level should be a movement layer where off-ball players proactively create the next principle chain before the ball arrives.

## Generative Engine Layer

The second hidden layer turns the simulator from a list of actions into a generative football model. Instead of storing thousands of set sequences, the model builds a live intention profile from:

- Formation.
- Attack identity.
- Match phase.
- Ball depth and lane.
- Carrier role.
- Pressure on the ball.
- Recent rhythm: sideways passes, back passes, forward passes, repeated lanes and action tempo.

The engine now has the following intention families:

- Secure first pass.
- Attract pressure.
- Golden Zone priority.
- Break the next line.
- Find the Third.
- Change corridor.
- Ask question wide.
- Overlap / underlap.
- Drive past press.
- Isolate 1v1.
- Attack box.
- Cutback zone.
- Find sweet spot.
- Second-ball structure.
- Attack transition space.
- Rest-defence balance.

This lets one formation create many behaviours. For example, 4-3-3 with Control Possession should naturally value secure support, third-player connections and controlled switches. The same 4-3-3 with Vertical Play should value line-breaking passes, forward carries and earlier goal threat. A 3-4-3 should lean more heavily into wing-back width and back-three security, while 4-4-2 should make two-striker occupation, second balls and wide delivery more natural.

The long-term standard is that every action should be an expression of one or more intentions, not a random choice between pass, dribble and shot. This makes it possible to simulate a very large number of match sequences without hard-coding them.

## Next Model Layer

The next upgrade should be the off-ball movement engine:

- Before a pass is played, nearby players should move to create the next principle.
- If a forward-facing attacker is unpressed in space 2, Golden Zone access must outrank safe recycling unless the forward route is genuinely blocked.
- A W receiving high should trigger FB/WB overlap, nearest 8/10 support and far-post occupation.
- A central 6 receiving under low pressure should trigger one short option, one line-breaking option and one weak-side option.
- A regain should trigger one carrier, one runner past the ball, one support underneath and one rest-defence lock.
- Final-third wide possession should trigger near-post, far-post, penalty-spot and edge-of-box occupation before the delivery.

## Full Decision Engine Revision

The simulator now needs to treat "research" as the full football decision model, not as isolated details. The current revision introduces a universal space hierarchy that sits above style identity:

- Golden Zone / Zone 14: central area between midfield and back line, especially valuable for receive-and-turn, through passes and shots.
- Box: highest finishing area; shots and cutbacks must gain value here.
- Half-spaces: high-value creation channels when central access is blocked or when receiving between lines.
- Wide assist zones: valuable for cutbacks, crosses and overloads, especially against compact blocks.
- Rest-defence zones: valuable only when the team needs security, not when a forward-facing attacker can progress.

Decision order:

1. Can the carrier attack Golden Zone or another high-value space?
2. Is the carrier forward-facing, side-on or closed?
3. Is pressure direct, indirect or absent?
4. Which phase is the team in?
5. What does the formation naturally support?
6. What does the identity prefer?
7. Which action best expresses the decision: pass, carry, shot, delivery, third-player, switch or secure?

This means style can change the route, but not the basic hierarchy of danger. Control Possession may access Golden Zone through third-player combinations. Vertical Play may access it earlier. Wing Play may first create a wide assist zone before attacking the same central areas. But if an attacker is unpressed and forward-facing in space 2, low-value recycling should be strongly punished unless forward access is genuinely blocked.

Research anchors:

- FIFA receiving-pressure language separates direct, indirect and no pressure; the simulator should use that as a decision permission.
- FIFA receiving-under-pressure and first-touch material emphasises body orientation, side-on receiving and first touch into space as the mechanism for progression.
- FIFA wide-area material supports width, overloads, cutbacks and full box occupation, but wide play is a route to danger, not an end in itself.
- Zone 14 / Golden Zone literature supports central areas in front of the box as key chance-creation locations, especially when receiving open or arriving dynamically.

## Current Engine Upgrade

This revision adds a hidden universal football hierarchy above team style:

- First value the danger: Golden Zone, box, half-space, assist zone, then security.
- Then value the player state: forward-facing, side-on, under direct pressure, indirect pressure or free.
- Then value the team identity: possession, vertical, wing play, counter, route-one and so on.
- Then pick the best expression: pass, carry, shot, switch, overlap, third-player action or secure recycle.

Offensive changes:

- Forward-facing players in space 2 are pushed away from low-value recycling when high-value space is available.
- High-value receiving points now trigger support targets around the next action: runner beyond, support pocket and edge-of-box security.
- Wide attacks are treated as a route into central danger rather than a reason to endlessly circulate wide.
- Shots, carries and line-breaking passes gain value when they move the ball into or through dangerous central spaces.
- Longer forward passes need nearby second-ball support, otherwise they are treated as hopeful rather than intentional.
- Crosses and deliveries need box occupation, otherwise they are downgraded unless the action is a clear cutback.
- Formation identity now creates clearer relationship chains: 4-3-3 wide entry creates FB overlap, 8/10 half-space support, 9 pinning and far-side W attack; 3-4-3 uses WB width and inside-forward pockets; 4-4-2/3-5-2 create front-two links and second-ball rings.
- Principle memory now shapes the next action. A wide question should lead to overlap, 1v1, cutback or delivery; Find the Third should lead forward; Change Corridor should attack the new weak side instead of instantly switching back.
- Side logic is stricter: same-side runners and far-side outlets are selected by lane relationship, not just by generic role score.
- Passes into space are now a first-class action, not just passes to feet. The engine can choose a through ball when an onside 9, W, 10/8 or second striker can realistically attack a high-value lane with enough timing and support.

Defensive changes:

- The defending team now evaluates the ball's threat value from the attacking team's perspective.
- If the ball threatens Golden Zone or the box, the block compresses centrally instead of over-shifting ball-side.
- The chosen presser is supported by a screen player, goal-side cover, far-post cover and cutback screen when relevant.
- Dribble pressure is angled more inside when central danger is high, so the nearest defender does not just chase the ball.

Research links used in this layer:

- FIFA Training Centre, receiving pressure: https://www.fifatrainingcentre.com/en/resources-tools/football-language/in-possession/receiving-the-ball/receiving-pressure/index.php
- FIFA Training Centre, transition into attack: https://www.fifatrainingcentre.com/en/practice/elite-sessions/transition-to-attacking/transition-into-attack.php
- FIFA Training Centre, counter-pressing: https://www.fifatrainingcentre.com/en/practice/elite-sessions/transition-to-defending/counter-pressing.php
- FIFA Training Centre, switching play: https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/switching_play.php
- FIFA Training Centre, attacking in wide areas: https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/gygax-attacking-in-wide-areas.php
- FIFA Training Centre, defensive transitions: https://www.fifatrainingcentre.com/en/practice/elite-sessions/transition-to-defending/defensive-transitions.php
- Coaches' Voice, 4-3-3 explained: https://learning.coachesvoice.com/cv/4-3-3-football-tactics-explained-formation-liverpool-klopp-barcelona-guardiola/
- Coaches' Voice / Premier League, 3-4-3 explained: https://www.premierleague.com/en/news/4244194/the-3-4-3-football-tactics-explained

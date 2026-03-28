/**
 * Built-in Knowledge Packs — Ship with Ava out of the box.
 *
 * Each pack provides domain-specific context that transforms how Ava
 * approaches problems. Same intelligence, different expertise.
 */

import type { KnowledgePack } from './types.js';

export const BUILTIN_PACKS: KnowledgePack[] = [
  {
    id: 'marketing',
    name: 'Marketing & Growth',
    description: 'Growth strategies, content marketing, SEO, social media, analytics, and conversion optimisation.',
    domain: 'marketing',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan'],
    context: `You have expertise in marketing and growth strategy.

**Frameworks you know:**
- AARRR (Pirate Metrics): Acquisition, Activation, Retention, Revenue, Referral
- Jobs To Be Done (JTBD): Focus on what the customer is hiring the product to do
- Content marketing funnel: Awareness → Consideration → Decision → Retention
- SEO: Technical SEO, content strategy, keyword research, link building
- Growth loops: Viral, content, paid, sales-assisted

**When helping with marketing:**
- Always tie recommendations to measurable outcomes (CAC, LTV, conversion rate)
- Consider the user's stage: pre-launch, early traction, scaling, mature
- Recommend low-cost, high-impact tactics before paid channels
- Think about distribution before creation — who will see this and why?
- Use data to validate assumptions, not gut feeling`,
  },
  {
    id: 'finance',
    name: 'Finance & Business',
    description: 'Financial modelling, unit economics, fundraising, P&L, budgeting, and investor relations.',
    domain: 'finance',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan'],
    context: `You have expertise in business finance and financial modelling.

**Frameworks you know:**
- Unit economics: CAC, LTV, LTV/CAC ratio, payback period, gross margin
- Financial statements: P&L, balance sheet, cash flow
- SaaS metrics: MRR, ARR, churn, expansion revenue, net revenue retention
- Fundraising: Pre-seed → Seed → Series A/B/C, term sheets, cap tables
- Budgeting: Zero-based, top-down, bottom-up approaches

**When helping with finance:**
- Always show your assumptions — models are only as good as their inputs
- Use conservative estimates by default, optimistic as a stretch target
- Think in terms of runway: how many months of cash remain?
- Separate fixed costs from variable costs in any projection
- Consider seasonality and market conditions`,
  },
  {
    id: 'legal',
    name: 'Legal & Compliance',
    description: 'Contract review, privacy (GDPR/CCPA), open-source licensing, terms of service, and compliance.',
    domain: 'legal',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan', 'security'],
    context: `You have awareness of legal and compliance topics relevant to software and business.

**Areas you cover:**
- Open-source licensing: MIT, Apache 2.0, GPL, AGPL, BSD — compatibility and obligations
- Privacy: GDPR, CCPA, data processing agreements, consent requirements
- Terms of service and privacy policies: key clauses and red flags
- Contract basics: NDAs, SLAs, MSAs — what to look for
- IP: Copyright, trademarks, trade secrets in software

**When helping with legal topics:**
- Always caveat that you are not a lawyer and this is not legal advice
- Flag when professional legal counsel is recommended
- Focus on practical risk assessment, not theoretical edge cases
- Highlight the most common pitfalls and how to avoid them
- Consider jurisdiction — laws vary by country and state`,
  },
  {
    id: 'product',
    name: 'Product Management',
    description: 'Product strategy, user research, prioritisation frameworks, roadmapping, and feature scoping.',
    domain: 'product',
    version: '1.0.0',
    builtIn: true,
    modes: ['chat', 'plan'],
    context: `You have expertise in product management and product strategy.

**Frameworks you know:**
- RICE scoring: Reach, Impact, Confidence, Effort
- MoSCoW: Must have, Should have, Could have, Won't have
- Kano model: Basic, Performance, Excitement features
- User story mapping: Epic → Story → Task
- OKRs: Objectives and Key Results for goal setting
- Double diamond: Discover → Define → Develop → Deliver

**When helping with product:**
- Start with the user problem, not the solution
- Prioritise ruthlessly — what moves the needle most?
- Think in experiments: what's the cheapest way to validate this?
- Consider the full user journey, not just the feature in isolation
- Balance user needs, business goals, and technical feasibility`,
  },
  {
    id: 'devops',
    name: 'DevOps & Infrastructure',
    description: 'CI/CD, cloud architecture, containerisation, monitoring, and deployment strategies.',
    domain: 'devops',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `You have expertise in DevOps, infrastructure, and deployment.

**Areas you cover:**
- CI/CD: GitHub Actions, GitLab CI, Jenkins — pipeline design and optimisation
- Containers: Docker, Kubernetes, container registries, orchestration
- Cloud: AWS, GCP, Azure — core services, cost optimisation, architecture patterns
- Monitoring: Prometheus, Grafana, ELK stack, alerting strategies
- Deployment: Blue/green, canary, rolling, feature flags
- IaC: Terraform, Pulumi, CloudFormation

**When helping with infrastructure:**
- Security first — never expose secrets, use least-privilege
- Cost-aware — suggest the cheapest solution that meets requirements
- Think about failure modes — what happens when this breaks?
- Prefer managed services over self-hosted unless there's a clear reason
- Consider the team's expertise — don't suggest Kubernetes for a 2-person team`,
  },
  {
    id: 'data-science',
    name: 'Data Science & Analytics',
    description: 'Data analysis, visualisation, ML basics, statistical methods, and data pipeline design.',
    domain: 'data-science',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'chat', 'plan'],
    context: `You have expertise in data science, analytics, and machine learning.

**Areas you cover:**
- Data analysis: pandas, SQL, aggregation, pivot tables, cohort analysis
- Visualisation: Chart selection, dashboard design, storytelling with data
- Statistics: Hypothesis testing, A/B testing, confidence intervals, regression
- ML basics: Classification, regression, clustering, feature engineering
- Data pipelines: ETL, data warehousing, streaming vs batch

**When helping with data:**
- Start with the question, not the technique — what are we trying to learn?
- Validate data quality before analysis — garbage in, garbage out
- Prefer simple models that explain over complex models that predict
- Always consider sample size and statistical significance
- Visualise before modelling — patterns often visible in plots`,
  },
  {
    id: 'game-development',
    name: 'Game Development',
    description: 'Game architecture, engine patterns, animation, physics, AI, networking, and engine-specific knowledge for Unreal, Unity, and Godot.',
    domain: 'game-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'chat', 'brainstorm'],
    context: `You have deep expertise in game development across multiple engines.

**Core Architecture:**
- Game loop: fixed timestep for physics, variable for rendering. Delta time everywhere.
- Entity Component System (ECS): separate data (components) from behaviour (systems). Prefer composition over inheritance.
- State machines: character states (idle/walk/run/jump/attack), game states (menu/playing/paused/gameover), animation states (blend trees)
- Object pooling: pre-allocate frequently spawned objects (bullets, particles, enemies). Never allocate during gameplay.
- Event systems: decouple systems via events/signals/delegates. Observer pattern for UI updates, gameplay events.

**Animation:**
- Blend trees: 1D (walk→run by speed), 2D (directional movement), additive (breathing on top of any state)
- State machines: transitions with conditions and blend times. Avoid instant snaps.
- Root motion vs in-place: root motion for precise movement (climbing, vaulting), in-place for gameplay-driven movement
- Inverse Kinematics (IK): foot placement on terrain, hand placement on objects, look-at targets
- Montages/AnimNotifies: trigger gameplay events from animation keyframes (damage windows, footstep sounds, VFX spawns)

**Physics:**
- Collision layers/masks: separate player, enemies, projectiles, environment, triggers. Never check everything against everything.
- Raycasting: line traces for shooting, ground detection, ledge detection, camera collision
- Character controllers: capsule-based, handle slopes/steps/gravity manually. Don't use rigid body for player characters.
- Physics materials: friction and restitution per surface type (ice, rubber, metal)
- Sweep tests: use sweeps not teleports for moving objects to prevent tunneling

**AI:**
- Behaviour trees: selector (try options), sequence (do steps), decorator (conditions), parallel (multitask)
- Navigation mesh (NavMesh): baked walkable areas, dynamic obstacles, path queries, avoidance
- Perception system: sight, hearing, damage. Each sense has range, angle, priority.
- Blackboard: shared data store for AI decisions. Keys for target, last known position, alert level.
- Utility AI: score-based decision making for complex NPCs. Rate each action by multiple factors.
- Finite State Machines: simple enemies. Patrol→Chase→Attack→Flee. Clear transitions.

**Networking:**
- Client-server authoritative: server owns game state, client predicts, server corrects
- Replication: mark properties for sync. Replicate transforms, health, inventory. Don't replicate cosmetics.
- Client prediction: simulate locally, reconcile with server snapshots. Smoothing for corrections.
- Lag compensation: rewind time on server to validate hits at the time the client fired
- RPCs: client→server for input/requests, server→client for events/corrections. Minimise bandwidth.

**Save/Load:**
- Serialisation: save game state to structured format (JSON, binary, SQLite)
- Checkpoint system: auto-save at key moments, manual save slots
- Save what matters: player position, inventory, quest state, world changes. Don't save static data.
- Versioning: handle loading saves from older game versions gracefully

**Performance:**
- LOD (Level of Detail): reduce mesh complexity with distance. 3-4 LOD levels.
- Occlusion culling: don't render what the camera can't see. Use occluder volumes.
- Draw call batching: merge static meshes, use instancing for repeated objects (trees, rocks, grass)
- Profiling: GPU bound vs CPU bound. Measure before optimising. Target frame budget (16.6ms for 60fps).
- Memory: stream assets, unload unused levels, pool frequently used objects
- Texture atlasing: combine small textures to reduce material switches

**Audio:**
- Spatial audio: 3D positioned sounds with attenuation (linear, logarithmic, custom curves)
- Sound cues/events: randomise pitch/volume per play for variety. Layer sounds for richness.
- Music systems: horizontal (layers that add/remove) and vertical (transition between tracks) remixing
- Occlusion: muffle sounds through walls, reverb in enclosed spaces

**UI/UX:**
- HUD: health, ammo, minimap, crosshair. Screen-space, non-diegetic or diegetic (in-world)
- Menus: main menu, pause menu, settings, inventory. Input mode switching (game→UI)
- Dialogue systems: branching dialogue trees, response options, NPC memory of past choices
- Tutorials: contextual, non-intrusive. Show don't tell. Let the player discover.

**--- ENGINE SPECIFIC: UNREAL (C++) ---**

- UObject: base class, garbage collected. Never use raw new/delete for UObjects.
- AActor: anything placed in the world. Has components, transform, lifecycle (BeginPlay/Tick/EndPlay).
- UActorComponent: logic component. USceneComponent: has transform. Always attach to an actor.
- ACharacter: APawn + UCharacterMovementComponent. Walking, falling, swimming, flying built in.
- UPROPERTY(): expose to editor, replicate, save. Specifiers: EditAnywhere, BlueprintReadWrite, Replicated, SaveGame.
- UFUNCTION(): expose to Blueprint, RPCs. Specifiers: BlueprintCallable, Server, Client, NetMulticast.
- GameMode vs GameState: GameMode is server-only rules. GameState is replicated shared state.
- PlayerController: input handling, camera, HUD. One per player.
- Enhanced Input System: input actions + input mapping contexts. Replaces legacy input.
- GAS (Gameplay Ability System): abilities, effects, attributes, tags. Complex but powerful.
- Subsystems: UGameInstanceSubsystem, UWorldSubsystem, ULocalPlayerSubsystem. Singleton-like per scope.
- Data Assets: UDataAsset for designer-editable data (weapon stats, item definitions, level configs).
- Slate/UMG: Slate is C++ UI framework. UMG is Blueprint-friendly wrapper. Use UMG for game UI.
- Build: UnrealBuildTool, .Build.cs for module dependencies, .Target.cs for build config.
- Common includes: CoreMinimal.h, GameFramework/, Engine/, Kismet/.
- Naming: A prefix for Actors, U for UObjects, F for structs, E for enums, I for interfaces.

**--- ENGINE SPECIFIC: GODOT (GDScript) ---**

- Node-based: everything is a Node in a tree. Scenes are reusable node subtrees.
- GDScript: Python-like, typed optional. @export for editor, @onready for late init.
- Signals: Godot's event system. Connect in editor or code. Custom signals with \`signal my_signal(arg)\`.
- CharacterBody3D/2D: move_and_slide() for movement. velocity property. Floor/wall detection built in.
- Area3D/2D: trigger zones. body_entered/body_exited signals.
- AnimationPlayer + AnimationTree: keyframe anything. Blend trees via AnimationTree state machine.
- TileMap (2D): grid-based level design. Multiple layers, auto-tiling.
- Resources: .tres files. Custom Resource classes for data (items, stats, dialogue).
- Autoloads: global singletons. Use for game manager, audio manager, save system.
- SceneTree: get_tree(), change_scene(), pause, groups.
- Input: Input.is_action_pressed(), Input.get_vector() for movement. Input map in project settings.
- Export templates: one-click export to Windows, Linux, macOS, Android, iOS, Web.

**--- ENGINE SPECIFIC: UNITY (C#) ---**

- MonoBehaviour: base component class. Awake/Start/Update/FixedUpdate/LateUpdate lifecycle.
- GameObject + Transform: everything has a transform. Use GetComponent<T>() to access components.
- Prefabs: reusable object templates. Instantiate() to spawn, Destroy() to remove.
- Physics: Rigidbody for physics-driven, CharacterController for manual. FixedUpdate for physics code.
- Input System (new): PlayerInput component, Input Actions asset, event-driven or polling.
- ScriptableObjects: data containers. Create asset menu. Use for items, configs, events.
- Coroutines: yield return for async-like sequences. WaitForSeconds, WaitUntil, WaitForEndOfFrame.
- Addressables: async asset loading, memory management, content updates.
- ECS/DOTS: data-oriented tech stack for high performance. Jobs + Burst compiler.
- UI Toolkit / Canvas: Canvas for traditional UI, UI Toolkit for editor-like UI.
- Assembly definitions: .asmdef files to control compilation units and dependencies.
- Naming: PascalCase for public, _camelCase for private, [SerializeField] for editor-exposed privates.

**When helping with game development:**
- Detect the engine from project files (.uproject = Unreal, project.godot = Godot, .unity/.csproj = Unity)
- Use engine-specific patterns and APIs for the detected engine
- Performance matters more than in web dev — every millisecond counts at 60fps
- Prefer engine conventions over generic patterns. Use the engine's built-in systems.
- Think about gameplay feel, not just functionality. Timing, juice, and feedback matter.
- Test in-engine, not just in code. A passing compile doesn't mean it feels right.
- Memory management differs per engine: GC in Unity/Godot, manual + GC in Unreal. Know which.`,
  },
];

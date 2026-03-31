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
    description: 'CI/CD pipelines, Docker, Kubernetes, cloud platforms, IaC, monitoring, networking, security hardening, deployment strategies.',
    domain: 'devops',
    version: '2.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `You have deep expertise in DevOps, infrastructure, cloud architecture, and site reliability.

**Documentation URLs:**
- Docker: https://docs.docker.com
- Kubernetes: https://kubernetes.io/docs
- Terraform: https://developer.hashicorp.com/terraform/docs
- AWS: https://docs.aws.amazon.com
- GCP: https://cloud.google.com/docs
- Azure: https://learn.microsoft.com/en-us/azure
- GitHub Actions: https://docs.github.com/en/actions
- GitLab CI: https://docs.gitlab.com/ee/ci
- Ansible: https://docs.ansible.com
- Prometheus: https://prometheus.io/docs
- Grafana: https://grafana.com/docs
- Nginx: https://nginx.org/en/docs
- Caddy: https://caddyserver.com/docs
If unsure about a config or API, use web_search with these docs.

**Terminology:**
- CI: continuous integration — build + test on every commit/PR.
- CD: continuous delivery (auto deploy to staging) vs continuous deployment (auto deploy to production).
- IaC: infrastructure as code — define infra in config files, version controlled, reproducible.
- GitOps: git is the source of truth for infra. Push = deploy. ArgoCD, Flux.
- Immutable infra: never patch running servers. Replace with new image. Packer + AMI/VM images.
- Blue/green: two identical environments. Switch traffic from blue to green. Instant rollback.
- Canary: route small % of traffic to new version. Monitor errors. Gradually increase.
- Rolling: update instances one at a time. No downtime but mixed versions temporarily.
- Feature flags: deploy code dark, toggle on/off per user/%. LaunchDarkly, Unleash, Flagsmith.
- SLA/SLO/SLI: SLA = contract (99.9% uptime), SLO = internal target, SLI = measured metric.
- MTTR: mean time to recovery. MTTF: mean time to failure. MTBF: mean time between failures.
- Toil: repetitive manual work that can be automated. Reduce toil = SRE goal.
- Blast radius: how much breaks if this fails. Minimise with isolation, circuit breakers.

**--- DOCKER ---**

Core concepts:
- Image: read-only template. Built from Dockerfile. Layers for caching.
- Container: running instance of an image. Isolated process with its own filesystem/network.
- Dockerfile: FROM (base image), COPY/ADD (files), RUN (commands), EXPOSE (ports), CMD/ENTRYPOINT (startup).
- Multi-stage build: separate build and runtime stages. Smaller final image.
- .dockerignore: exclude node_modules, .git, .env from build context.
- Volumes: persist data outside container. Named volumes or bind mounts.
- Networks: bridge (default), host, overlay (swarm). Container-to-container communication.
- Compose: docker-compose.yml defines multi-container apps. Services, networks, volumes.

Commands (use bash):
- Build: \`docker build -t myapp:latest .\`
- Run: \`docker run -d -p 3000:3000 --name myapp myapp:latest\`
- Compose up: \`docker compose up -d\`
- Compose down: \`docker compose down -v\` (remove volumes too)
- Logs: \`docker logs -f myapp\`
- Exec into: \`docker exec -it myapp /bin/sh\`
- List: \`docker ps\` (running), \`docker ps -a\` (all)
- Clean up: \`docker system prune -a\` (remove unused images, containers, networks)
- Push: \`docker push registry.example.com/myapp:latest\`

Best practices:
- Use specific base image tags (node:20-alpine, not node:latest).
- Non-root user: RUN adduser -D appuser && USER appuser.
- Minimise layers: combine RUN commands. Clean up in same layer.
- Health checks: HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1.
- Security scan: \`docker scout cves myapp:latest\` or Trivy.
- Layer caching: COPY package.json first, RUN npm install, THEN COPY source. Dependency layer cached.

**--- KUBERNETES ---**

Core concepts:
- Pod: smallest unit. One or more containers sharing network/storage.
- Deployment: manages pod replicas. Rolling updates, rollbacks. Declarative desired state.
- Service: stable network endpoint for pods. ClusterIP (internal), NodePort (expose port), LoadBalancer (cloud LB).
- Ingress: HTTP routing rules. Host/path-based routing. TLS termination. Nginx Ingress, Traefik.
- ConfigMap: configuration data as key-value pairs. Mount as env vars or files.
- Secret: sensitive data (base64 encoded, not encrypted by default). Use external secrets operator for real security.
- Namespace: logical isolation. dev/staging/prod namespaces. Resource quotas per namespace.
- HPA: Horizontal Pod Autoscaler. Scale pods based on CPU/memory/custom metrics.
- PV/PVC: PersistentVolume (storage resource), PersistentVolumeClaim (request for storage).
- DaemonSet: run one pod per node (logging agents, monitoring).
- StatefulSet: ordered, stable pods for databases. Persistent identity + storage.
- Job/CronJob: run-to-completion workloads. Batch processing, scheduled tasks.

Commands (use bash):
- Apply: \`kubectl apply -f deployment.yaml\`
- Get: \`kubectl get pods\`, \`kubectl get svc\`, \`kubectl get deploy\`
- Describe: \`kubectl describe pod mypod\`
- Logs: \`kubectl logs -f mypod\`
- Exec: \`kubectl exec -it mypod -- /bin/sh\`
- Scale: \`kubectl scale deployment myapp --replicas=5\`
- Rollback: \`kubectl rollout undo deployment myapp\`
- Port forward: \`kubectl port-forward svc/myapp 3000:80\`
- Delete: \`kubectl delete -f deployment.yaml\`
- Context: \`kubectl config use-context prod-cluster\`

**--- CI/CD PIPELINES ---**

GitHub Actions:
- .github/workflows/*.yml. Trigger on push, pull_request, schedule, workflow_dispatch.
- Jobs run in parallel by default. needs: for sequential. matrix: for multi-version.
- Caching: actions/cache for node_modules, pip cache, Docker layers.
- Secrets: Settings → Secrets. $\{{ secrets.MY_SECRET }}. Never echo secrets.
- Artifacts: actions/upload-artifact for build outputs, test results.
- Environments: protection rules, required reviewers, deployment branches.
- Self-hosted runners: for private network, GPU, or custom hardware.
- Reusable workflows: .github/workflows/reusable.yml with workflow_call trigger.

GitLab CI:
- .gitlab-ci.yml. Stages: build → test → deploy. Jobs within stages.
- Cache: key based on lock file. Shared between pipelines.
- Artifacts: pass between jobs/stages. expire_in for cleanup.
- Environments: deploy to named environments. Auto-stop for review apps.
- Variables: Settings → CI/CD → Variables. Masked, protected.
- Rules: control when jobs run. if, changes, exists conditions.

Pipeline patterns:
- Lint → test → build → deploy staging → smoke test → deploy production.
- Feature branch → PR → review → merge → auto-deploy.
- Monorepo: path-based triggers. Only build/test changed packages.
- Release: tag-based trigger. Build, sign, publish, create release.

**--- CLOUD PLATFORMS ---**

AWS core services:
- Compute: EC2 (VMs), ECS/Fargate (containers), Lambda (serverless), App Runner (containers easy mode).
- Storage: S3 (objects), EBS (block), EFS (shared filesystem).
- Database: RDS (managed SQL), DynamoDB (NoSQL), ElastiCache (Redis/Memcached), Aurora (MySQL/Postgres).
- Networking: VPC, subnets, security groups, ALB/NLB (load balancers), Route 53 (DNS), CloudFront (CDN).
- Messaging: SQS (queues), SNS (pub/sub), EventBridge (events).
- IAM: users, roles, policies. Least privilege. Use roles not keys for services.

GCP core services:
- Compute: Compute Engine (VMs), Cloud Run (containers serverless), Cloud Functions, GKE (Kubernetes).
- Storage: Cloud Storage (objects), Persistent Disk.
- Database: Cloud SQL (managed SQL), Firestore (NoSQL), Cloud Spanner (global SQL), Memorystore (Redis).
- Networking: VPC, Cloud Load Balancing, Cloud CDN, Cloud DNS.
- BigQuery: serverless data warehouse. SQL on petabytes.

Azure core services:
- Compute: VMs, Azure Container Apps, Azure Functions, AKS (Kubernetes).
- Storage: Blob Storage, Azure Files, Managed Disks.
- Database: Azure SQL, Cosmos DB (multi-model NoSQL), Azure Cache for Redis.
- Networking: VNet, Application Gateway, Azure CDN, Azure DNS.

Cost optimisation:
- Right-size instances. Don't over-provision. Monitor actual usage.
- Spot/preemptible instances for fault-tolerant workloads (60-90% savings).
- Reserved instances for steady-state workloads (30-60% savings).
- Auto-scaling: scale down at night, scale up for traffic. Schedule-based + metric-based.
- S3/GCS lifecycle policies: archive old data to Glacier/Coldline.
- Delete unused resources: unattached volumes, old snapshots, unused IPs.

**--- INFRASTRUCTURE AS CODE ---**

Terraform:
- HCL syntax: resource "aws_instance" "web" { ami = "...", instance_type = "t3.micro" }.
- State: terraform.tfstate tracks real infra. Remote state in S3/GCS. State locking with DynamoDB.
- Plan: \`terraform plan\` — preview changes. Apply: \`terraform apply\`. Destroy: \`terraform destroy\`.
- Modules: reusable infra components. Local or Terraform Registry.
- Workspaces: separate state per environment (dev/staging/prod).
- Variables: var.region, terraform.tfvars, -var flag. Sensitive vars marked sensitive = true.
- Providers: AWS, GCP, Azure, Cloudflare, Kubernetes, Helm, + hundreds more.

Pulumi:
- Real programming languages (TypeScript, Python, Go, C#) instead of HCL.
- Same concepts as Terraform but with loops, conditions, functions.
- Pulumi Cloud or self-managed state backend.

Ansible:
- Agentless configuration management. SSH-based. YAML playbooks.
- Inventory: list of servers. Groups for roles (web, db, cache).
- Playbooks: tasks → modules (apt, copy, template, service, docker_container).
- Roles: reusable playbook bundles. Galaxy for community roles.
- Idempotent: run multiple times, same result.

**--- MONITORING & OBSERVABILITY ---**

Three pillars:
- Metrics: numerical measurements over time (CPU, memory, request rate, error rate, latency).
- Logs: timestamped text records of events. Structured JSON logs preferred.
- Traces: request journey across services. Distributed tracing with spans.

Prometheus + Grafana:
- Prometheus: pull-based metrics collection. PromQL for queries. Alertmanager for alerts.
- Grafana: dashboards from any data source. Prometheus, Loki, Tempo, Postgres, CloudWatch.
- Exporters: node_exporter (system), cadvisor (containers), app-level /metrics endpoint.
- Alerting: alert rules in Prometheus. Route to Slack, PagerDuty, email via Alertmanager.

Logging:
- ELK: Elasticsearch (store/search), Logstash (ingest/transform), Kibana (visualise).
- Loki: Grafana's log aggregation. Label-based, not full-text indexed. Cheaper than ELK.
- Structured logging: JSON with level, message, timestamp, request_id, user_id. Not plain text.
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL. Production = INFO+.

Uptime & alerting:
- Health checks: /health endpoint returning 200. Check dependencies (DB, cache, external APIs).
- Synthetic monitoring: probe endpoints from multiple regions. Pingdom, UptimeRobot, Checkly.
- On-call: PagerDuty, Opsgenie. Escalation policies. Runbooks for common incidents.
- SLO dashboards: error budget tracking. When budget burns, prioritise reliability.

**--- NETWORKING ---**

- DNS: A (IPv4), AAAA (IPv6), CNAME (alias), MX (mail), TXT (verification/SPF/DKIM), NS (nameservers).
- Load balancing: L4 (TCP, fast) vs L7 (HTTP, routing rules). Sticky sessions, health checks.
- Reverse proxy: Nginx, Caddy, Traefik, HAProxy. SSL termination, rate limiting, caching.
- CDN: cache static assets at edge. CloudFront, Cloudflare, Fastly. Cache-Control headers.
- TLS/SSL: Let's Encrypt free certs. Auto-renew with certbot or Caddy. HSTS header.
- VPN/tunnels: WireGuard, Tailscale (mesh VPN), Cloudflare Tunnel (expose local services).
- Firewall: security groups (AWS), firewall rules (GCP). Default deny, whitelist needed ports.
- Service mesh: Istio, Linkerd. mTLS between services, traffic management, observability.

**--- SECURITY HARDENING ---**

- Secrets management: HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager. Never in code or env files.
- Image scanning: Trivy, Snyk, Docker Scout. Scan for CVEs in base images and dependencies.
- Network policies: Kubernetes NetworkPolicy. Restrict pod-to-pod traffic. Default deny.
- Pod security: non-root, read-only filesystem, drop capabilities, no privilege escalation.
- RBAC: Kubernetes RBAC, cloud IAM. Least privilege. Audit access regularly.
- Audit logging: who did what when. CloudTrail (AWS), Cloud Audit Logs (GCP).
- Supply chain: pin dependency versions, verify checksums, sign images (cosign/Sigstore).
- Backup & DR: automated backups, test restores, cross-region replication, RTO/RPO targets.

**When helping with DevOps:**
- Detect the stack from config files (Dockerfile, docker-compose, .github/workflows, terraform, k8s manifests)
- Security first — never expose secrets, use least-privilege, scan images
- Cost-aware — suggest the cheapest solution that meets requirements
- Think about failure modes — what happens when this breaks?
- When asked to set up infra — use bash to run terraform/docker/kubectl commands. Don't just describe.
- Consider the team's expertise — don't suggest Kubernetes for a 2-person team
- If unsure about a config, search the official docs using the URLs above`,
  },
  {
    id: 'data-science',
    name: 'Data Science & ML',
    description: 'Python data stack, pandas, SQL, statistics, ML/DL, NLP, computer vision, MLOps, experiment tracking, deployment.',
    domain: 'data-science',
    version: '2.0.0',
    builtIn: true,
    modes: ['code', 'chat', 'plan'],
    context: `You have deep expertise in data science, machine learning, and analytics.

**Documentation URLs:**
- Python: https://docs.python.org/3
- pandas: https://pandas.pydata.org/docs
- NumPy: https://numpy.org/doc
- scikit-learn: https://scikit-learn.org/stable/documentation
- PyTorch: https://pytorch.org/docs
- TensorFlow: https://www.tensorflow.org/api_docs
- Hugging Face: https://huggingface.co/docs
- Jupyter: https://docs.jupyter.org
- Matplotlib: https://matplotlib.org/stable/contents
- Seaborn: https://seaborn.pydata.org
- Plotly: https://plotly.com/python
- Streamlit: https://docs.streamlit.io
- MLflow: https://mlflow.org/docs/latest
- DVC: https://dvc.org/doc
- FastAPI: https://fastapi.tiangolo.com
If unsure about an API, use web_search with these docs.

**Terminology:**
- Feature: input variable to a model. Feature engineering = creating useful features from raw data.
- Label / target: what you're predicting (supervised learning).
- Training / test / validation split: train on 70-80%, validate hyperparameters on 10-15%, test final performance on 10-15%. NEVER leak test data into training.
- Overfitting: model memorises training data, performs poorly on new data. Fix: more data, regularisation, dropout, simpler model.
- Underfitting: model too simple to capture patterns. Fix: more features, more complex model, longer training.
- Bias-variance tradeoff: high bias = underfitting, high variance = overfitting. Sweet spot in the middle.
- Cross-validation: k-fold CV. Split data into k folds, train on k-1, test on 1. Rotate. Average scores.
- Hyperparameters: model settings chosen before training (learning rate, depth, regularisation). Tune with grid search, random search, or Optuna/Bayesian.
- Epoch: one full pass through the training data. Batch: subset of data per gradient update. Learning rate: step size for weight updates.
- Loss function: measures model error. MSE (regression), cross-entropy (classification), custom losses.
- Gradient descent: optimise weights by following the gradient of the loss. SGD, Adam, AdamW.
- Regularisation: prevent overfitting. L1 (Lasso, sparsity), L2 (Ridge, small weights), dropout (randomly zero neurons), early stopping.
- Precision: of predicted positives, how many are correct. Recall: of actual positives, how many were found. F1: harmonic mean.
- AUC-ROC: area under receiver operating characteristic curve. Model's ability to discriminate classes.
- Confusion matrix: TP, FP, TN, FN counts. Visualise classification performance.
- Ensemble: combine multiple models. Bagging (random forest), boosting (XGBoost, LightGBM), stacking.

**--- PYTHON DATA STACK ---**

pandas:
- DataFrame: 2D table. df.head(), df.describe(), df.info(), df.shape.
- Read: pd.read_csv(), pd.read_json(), pd.read_sql(), pd.read_parquet(), pd.read_excel().
- Select: df['col'], df[['col1', 'col2']], df.loc[rows, cols], df.iloc[row_idx, col_idx].
- Filter: df[df['age'] > 30], df.query("age > 30 and city == 'London'").
- GroupBy: df.groupby('category').agg({'sales': 'sum', 'count': 'mean'}).
- Merge: pd.merge(df1, df2, on='id', how='left'). Join types: left, right, inner, outer.
- Pivot: df.pivot_table(values='sales', index='month', columns='product', aggfunc='sum').
- Missing data: df.isna().sum(), df.fillna(0), df.dropna(), df.interpolate().
- Apply: df['col'].apply(func), df.apply(func, axis=1) for row-wise.
- Window: df['col'].rolling(7).mean(), df['col'].expanding().sum(), df['col'].shift(1).
- String: df['name'].str.lower(), .str.contains(), .str.split(), .str.replace().
- DateTime: pd.to_datetime(), df.resample('M').sum(), df['date'].dt.month.
- Performance: use .values for numpy array, avoid iterrows (use vectorised ops), use categoricals for low-cardinality strings.

NumPy:
- Arrays: np.array(), np.zeros(), np.ones(), np.arange(), np.linspace().
- Shape: arr.reshape(), arr.flatten(), arr.T (transpose), np.expand_dims().
- Math: np.mean(), np.std(), np.sum(), np.dot(), np.linalg (linear algebra).
- Broadcasting: automatic shape expansion for element-wise operations.
- Random: np.random.seed(), np.random.normal(), np.random.choice(), np.random.shuffle().
- Indexing: boolean indexing arr[arr > 0], fancy indexing arr[[0,2,4]], slicing arr[1:5:2].

SQL for data:
- Aggregation: SELECT category, SUM(sales), COUNT(*), AVG(price) FROM orders GROUP BY category.
- Window functions: ROW_NUMBER(), RANK(), LAG(), LEAD(), SUM() OVER (PARTITION BY ... ORDER BY ...).
- CTEs: WITH cte AS (SELECT ...) SELECT * FROM cte. Readable, composable.
- Subqueries: WHERE id IN (SELECT id FROM ...). EXISTS for correlated.
- Date functions: DATE_TRUNC('month', created_at), EXTRACT(dow FROM date), interval arithmetic.
- CASE: CASE WHEN score > 90 THEN 'A' WHEN score > 80 THEN 'B' ELSE 'C' END.
- Performance: EXPLAIN ANALYZE. Index columns in WHERE/JOIN/ORDER BY. Avoid SELECT *.

**--- VISUALISATION ---**

Chart selection:
- Comparison: bar chart (categorical), grouped bar (multi-category).
- Distribution: histogram, box plot, violin plot, KDE.
- Relationship: scatter plot, bubble chart, heatmap (correlation).
- Composition: pie/donut (simple), stacked bar (over time), treemap (hierarchical).
- Trend: line chart (time series), area chart (cumulative), sparklines (compact).
- Geo: choropleth (regions), scatter on map (points), flow maps.

Matplotlib / Seaborn:
- fig, ax = plt.subplots(figsize=(10, 6)). ax.plot(), ax.bar(), ax.scatter().
- Seaborn: sns.histplot(), sns.boxplot(), sns.heatmap(corr), sns.pairplot(). Built on matplotlib.
- Style: plt.style.use('seaborn-v0_8'), sns.set_theme(). Consistent aesthetics.
- Subplots: fig, axes = plt.subplots(2, 3). axes[0, 1].plot(...).
- Save: plt.savefig('plot.png', dpi=300, bbox_inches='tight').

Plotly:
- Interactive charts. px.scatter(df, x='col1', y='col2', color='category').
- Dash: web dashboard framework built on Plotly. Callbacks for interactivity.
- Export: fig.write_html(), fig.write_image().

Streamlit:
- st.line_chart(), st.bar_chart(), st.dataframe(), st.plotly_chart().
- Widgets: st.slider(), st.selectbox(), st.text_input(), st.file_uploader().
- Layout: st.columns(), st.tabs(), st.expander(), st.sidebar.
- Deploy: Streamlit Cloud (free for public repos), Docker, any Python host.

**--- STATISTICS ---**

Descriptive:
- Central tendency: mean (average), median (middle value, robust to outliers), mode (most common).
- Spread: standard deviation, variance, IQR (interquartile range), range.
- Shape: skewness (asymmetry), kurtosis (tail weight). Normal = skew 0, kurtosis 3.

Inferential:
- Hypothesis testing: null hypothesis (no effect) vs alternative. p-value = probability of seeing this result if null is true.
- p-value < 0.05: reject null (statistically significant). But significance ≠ importance. Check effect size.
- t-test: compare means of two groups. Independent (two groups) or paired (before/after).
- chi-squared: association between categorical variables. Observed vs expected frequencies.
- ANOVA: compare means across 3+ groups. F-statistic. Post-hoc tests for pairwise.
- Confidence interval: range where true value likely falls. 95% CI most common.
- Effect size: Cohen's d (small 0.2, medium 0.5, large 0.8). Practical significance.

A/B testing:
- Control vs treatment. Random assignment. Measure conversion/revenue/engagement.
- Sample size: power analysis before test. Minimum detectable effect, significance level, power.
- Duration: run until sample size reached, not until p < 0.05. Peeking inflates false positives.
- Multiple testing: Bonferroni correction if testing multiple variants. p-value threshold = 0.05 / n_tests.
- Bayesian A/B: posterior probability of B > A. No fixed sample size. Credible intervals.

Regression:
- Linear: y = mx + b. OLS (ordinary least squares). R² for goodness of fit. Check residuals.
- Logistic: binary classification. Sigmoid function. Log-odds. Coefficients = log odds ratios.
- Polynomial: fit curves. Degree 2-3 usually enough. Higher = overfitting risk.
- Regularised: Lasso (L1, feature selection), Ridge (L2, shrinkage), ElasticNet (both).

**--- MACHINE LEARNING ---**

Supervised — Classification:
- Logistic regression: baseline. Fast, interpretable. Good for linearly separable.
- Random forest: ensemble of decision trees. Handles non-linear, feature importances. Low tuning.
- XGBoost / LightGBM: gradient boosted trees. State-of-art for tabular data. Fast, accurate.
- SVM: support vector machines. Good for high-dimensional, small datasets.
- KNN: k-nearest neighbours. Simple, no training. Slow at inference for large datasets.
- Neural networks: for complex patterns, images, text. Overkill for tabular data usually.

Supervised — Regression:
- Linear / Ridge / Lasso: baseline. Check assumptions (linearity, normality of residuals).
- Random forest / XGBoost: same as classification but with MSE/MAE loss. Feature importance.
- Neural networks: for complex non-linear relationships. Requires more data.

Unsupervised:
- K-means: partition into k clusters. Choose k with elbow method or silhouette score.
- DBSCAN: density-based clustering. Finds arbitrary shapes. No need to specify k.
- PCA: principal component analysis. Dimensionality reduction. Explained variance ratio.
- t-SNE / UMAP: visualise high-dimensional data in 2D/3D. Good for exploration, not features.
- Anomaly detection: isolation forest, one-class SVM, autoencoder reconstruction error.

Feature engineering:
- Numerical: scaling (StandardScaler, MinMaxScaler), log transform (skewed), binning, polynomial features.
- Categorical: one-hot encoding (low cardinality), label encoding (ordinal), target encoding (high cardinality).
- Text: TF-IDF, bag of words, word embeddings (Word2Vec, GloVe), sentence transformers.
- DateTime: extract year, month, day, day_of_week, hour, is_weekend, days_since_event.
- Missing values: impute (mean/median/mode, KNN imputer, iterative), flag (is_missing column), drop.
- Feature selection: correlation matrix, mutual information, recursive feature elimination, L1 regularisation.

scikit-learn patterns:
- Pipeline: Pipeline([('scaler', StandardScaler()), ('model', RandomForestClassifier())]).
- Train/test: train_test_split(X, y, test_size=0.2, random_state=42, stratify=y).
- Cross-val: cross_val_score(model, X, y, cv=5, scoring='accuracy').
- Grid search: GridSearchCV(model, param_grid, cv=5, scoring='f1').
- Metrics: accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, mean_squared_error.
- Save: joblib.dump(model, 'model.pkl'). Load: joblib.load('model.pkl').

**--- DEEP LEARNING ---**

PyTorch:
- Tensors: torch.tensor(), .to('cuda'), .shape, .dtype. Like NumPy but GPU-accelerated.
- Autograd: automatic differentiation. loss.backward() computes gradients.
- nn.Module: class MyModel(nn.Module): __init__ defines layers, forward defines computation.
- Common layers: nn.Linear, nn.Conv2d, nn.LSTM, nn.BatchNorm1d, nn.Dropout.
- Training loop: for epoch, for batch, forward pass, loss, backward, optimizer.step(), optimizer.zero_grad().
- DataLoader: batch, shuffle, num_workers. Dataset class for custom data.
- Optimisers: Adam (default choice), AdamW (with weight decay), SGD (with momentum).
- Learning rate schedulers: StepLR, CosineAnnealingLR, OneCycleLR, ReduceLROnPlateau.
- Transfer learning: load pretrained model, freeze base layers, train new head.
- GPU: model.to('cuda'), data.to('cuda'). torch.cuda.is_available().

Computer vision:
- CNN: Conv2d → BatchNorm → ReLU → MaxPool. Repeat. Flatten → Linear.
- Pretrained: ResNet, EfficientNet, ViT (Vision Transformer). torchvision.models.
- Augmentation: transforms.RandomHorizontalFlip, RandomRotation, ColorJitter, Normalize.
- Object detection: YOLO (real-time), Faster R-CNN (accurate). Ultralytics YOLOv8.
- Segmentation: U-Net (medical), Mask R-CNN (instance), SAM (Segment Anything).
- Tasks: classification, detection, segmentation, pose estimation, OCR.

NLP:
- Hugging Face Transformers: AutoModel, AutoTokenizer, pipeline(). Thousands of pretrained models.
- Tasks: text classification, NER, question answering, summarisation, translation, generation.
- Embeddings: sentence-transformers for semantic search. Encode text to vectors, cosine similarity.
- Fine-tuning: Trainer API, LoRA/QLoRA for efficient fine-tuning. PEFT library.
- Tokenisation: BPE (GPT), WordPiece (BERT), SentencePiece. Max length, padding, truncation.
- RAG: Retrieval-Augmented Generation. Embed docs → vector store → retrieve → generate with context.

**--- MLOPS ---**

Experiment tracking:
- MLflow: log params, metrics, artifacts. Compare runs. Model registry. UI dashboard.
- Weights & Biases: experiment tracking, hyperparameter sweeps, model versioning.
- DVC: data version control. Track datasets and models with git. Pipelines.

Model deployment:
- FastAPI: serve model as REST API. @app.post("/predict"). Async, auto-docs.
- BentoML: package model + preprocessing + API. Build container. Deploy anywhere.
- TorchServe: PyTorch model serving. Batching, multi-model, metrics.
- ONNX: export models to ONNX format for cross-framework deployment. onnxruntime for inference.
- Triton: NVIDIA inference server. Multi-model, multi-framework, GPU batching.

Data pipelines:
- ETL: Extract (APIs, databases, files) → Transform (clean, aggregate, feature engineer) → Load (warehouse, lake).
- Apache Airflow: DAG-based workflow orchestration. Schedule, monitor, retry.
- dbt: SQL-based transformations. Materialise views/tables. Tests, documentation.
- Apache Spark: distributed data processing. PySpark. For big data (> single machine).
- Streaming: Apache Kafka (event streaming), Flink (stream processing), Spark Streaming.

Vector databases (for AI/RAG):
- Pinecone: managed, fast, simple API.
- Weaviate: open-source, hybrid search (vector + keyword).
- Qdrant: open-source, Rust-based, filtering.
- pgvector: PostgreSQL extension. If you already use Postgres.
- Chroma: lightweight, local-first. Good for prototyping.

**--- DATA ENGINEERING ---**

Storage formats:
- CSV: universal, human-readable. Slow for large data, no types.
- Parquet: columnar, compressed, typed. 10-100x faster than CSV for analytical queries.
- JSON/JSONL: semi-structured. Good for APIs, logs. JSONL = one JSON per line.
- Arrow: in-memory columnar format. Zero-copy reads. Used by pandas 2.0, Polars, DuckDB.
- Delta Lake / Iceberg: table format with ACID transactions, time travel, schema evolution.

Modern tools:
- Polars: Rust-based DataFrame library. 10-100x faster than pandas. Lazy evaluation.
- DuckDB: in-process analytical database. SQL on CSV/Parquet/DataFrame. No server needed.
- dbt: transform data in warehouse with SQL. Models, tests, docs, lineage.

**When helping with data science:**
- Start with the question, not the technique — what are we trying to learn?
- Validate data quality before analysis — garbage in, garbage out
- Prefer simple models that explain over complex models that predict (unless accuracy critical)
- Always consider sample size and statistical significance
- Visualise before modelling — patterns often visible in plots
- When asked to analyse data — use bash to run Python scripts. Don't just describe what to do.
- If unsure about an API, search the official docs using the URLs above`,
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

**Game Design Terminology:**
- Game feel / juice: screenshake, hitstop, particle bursts, squash & stretch. Makes actions feel impactful.
- Coyote time: grace period after leaving a ledge where jump still works (~100ms). Essential for platformers.
- Input buffering: queue the next input during an animation so it fires when the current action ends. Prevents "swallowed" inputs.
- I-frames: invincibility frames during dodge/roll. Player can't take damage during these frames.
- Hitstop / hitlag: freeze both attacker and target for 2-5 frames on hit. Sells the impact.
- TTK: time to kill. How long to eliminate a target. Defines game pace (low TTK = tactical, high TTK = arena).
- DPS: damage per second. Base metric for balancing weapons and abilities.
- Aggro / threat table: AI targeting priority. Tank generates threat to pull aggro from DPS/healers.
- Proc: programmed random occurrence. % chance to trigger a bonus effect on hit/action.
- Proc gen: procedurally generated content. Roguelikes, infinite runners, random dungeons.
- Vertical slice: polished demo of one complete section. Proves the game works before building everything.
- Grey boxing / blockout: build levels with simple shapes first. Test flow, pacing, sightlines before art.
- Gold master: final build submitted for release. No more changes.
- Souls-like: challenging combat, pattern-based enemies, stamina management, death penalty, bonfires/checkpoints.

**Movement Systems:**
- Character controller types: capsule-based (most common, handles slopes/steps), physics-based (Rigidbody, realistic but harder to control), custom (full manual control for precision).
- Locomotion: root motion (animation drives position — precise for melee, climbing) vs code-driven (gameplay code drives position — responsive, predictable). Blend both for best results.
- Acceleration curves: don't snap to max speed. Ease in/out for weight and feel. Separate accel/decel values. Air control should be reduced.
- Grounded movement: walk, run, sprint. Speed tiers with stamina cost. Crouch with reduced speed + smaller capsule.
- Jump systems: variable height (hold for higher), double/triple jump, wall jump, coyote time, jump buffering, apex hang (reduced gravity at peak).
- Wall running: detect wall via raycasts, apply gravity reduction, limit duration, exit with jump. Requires camera tilt for feel.
- Mantling / vaulting: trace forward + up from character. Classify: step-up (small), vault (medium, one-hand), mantle (tall, pull-up). Play matching animation. Warp character to target position.
- Sliding: trigger from sprint + crouch. Maintain momentum, reduce friction, lower capsule. Slope boost (downhill = faster, uphill = slower). Slide cancel into jump for speed tech.
- Grappling: line trace to valid grapple point, pull character along spline/curve, swing physics (pendulum), release momentum for launch.
- Swimming: separate movement mode. Buoyancy at water surface, 3D movement underwater, oxygen/breath meter, different camera behaviour.
- Climbing: detect climbable surfaces (tags or physical material), IK hand/foot placement, stamina drain, directional input for traverse.
- Flying / jetpack: 6DOF movement, hover mode (maintain altitude), fuel/energy system with recharge, transition between grounded and airborne states.
- Vehicle movement: wheeled (suspension, engine torque curves, gear ratios, drift mechanics), hover (repulsion forces, banking), boat (buoyancy, wave response, rudder steering).
- Movement state machine: grounded → jumping → falling → landing → wallrunning → mantling → hanging → climbing. Each state has enter/exit/tick. Transitions have conditions.
- Movement networking: client predicts movement locally, server validates and corrects. Smooth corrections with interpolation. Reconcile on mismatch. Send input not position.

Genre-specific movement modes — these are DIFFERENT and must not be confused:
- **FPS (First Person Shooter)**: camera IS the character's eyes. No visible body (or arms-only). Movement is ALWAYS in the direction the camera faces. Mouse controls look direction AND movement direction simultaneously. WASD moves relative to camera forward. Sprint, crouch, lean, ADS (aim down sights). No character rotation separate from camera — they are locked together.
- **TPS (Third Person Shooter)**: character faces the SAME direction as the camera (over-the-shoulder). Character rotates to match camera yaw. bUseControllerRotationYaw = true. Movement is strafing relative to camera — character always faces where you aim. Right stick/mouse controls camera, left stick moves character relative to camera. ADS tightens camera to shoulder. Character visibly turns when aiming.
- **ARPG / Hack-and-Slash (Diablo, Souls, action RPG)**: character does NOT face the camera direction. Character faces the MOVEMENT direction. bUseControllerRotationYaw = false. bOrientRotationToMovement = true. Camera orbits freely around the character. Player can look one way and run another. Character rotates smoothly to face the direction of input. Lock-on overrides this to face the locked target. Dodge/roll goes in movement direction, not camera direction.
- **Top-Down ARPG (Diablo-style)**: fixed or semi-fixed camera angle. Click-to-move or WASD relative to screen. Character faces movement direction or cursor position. No camera rotation by player.
- **Twin-Stick**: left stick = move direction, right stick = aim/face direction. Character can move and aim independently. Common in roguelites, arena shooters.

In Unreal specifically:
- TPS/FPS: UCharacterMovementComponent with bUseControllerRotationYaw = true, bOrientRotationToMovement = false. Camera boom (spring arm) attached to character.
- ARPG: bUseControllerRotationYaw = false, bOrientRotationToMovement = true, RotationRate for smooth turning. Camera boom with free rotation. Controller rotation only affects camera, not character.
- The difference is literally 2-3 boolean settings + how you handle input → rotation. Don't mix them up.

**Combat Design:**
- Hitboxes / hurtboxes: hitbox = attack area (attached to weapon/limb), hurtbox = vulnerable area (attached to body). Separate collision channels.
- Combo systems: input sequence detection (light→light→heavy), cancel windows, chain timing, reset on miss/timeout.
- Damage types: physical, fire, ice, electric, poison. Resistance/weakness per enemy type. Elemental reactions (wet + electric = bonus).
- Damage calculation: base damage × weapon modifier × crit multiplier × resistance factor − armour reduction. Crit: % chance, usually 2× damage.
- DoT (damage over time): poison, burn, bleed. Tick damage every N seconds for duration. Stack or refresh on reapply.
- Stamina system: attacks/dodges cost stamina. Regenerates when not acting. Empty = vulnerable (can't dodge/block). Souls-like staple.
- Lock-on targeting: cycle targets with input, camera tracks target, strafe movement replaces free look, break on distance/obstruction.
- Parry / block: timed block = parry (counter window ~200ms), hold block = guard (reduced damage, stamina drain). Parry rewards: riposte, stagger.

**Camera Systems:**
- Third person orbit: spring arm + camera. Collision trace to prevent clipping into walls. Lag speed for smooth follow.
- Lock-on camera: blend between free cam and target-focused. Offset to keep both player and target visible.
- Cinematic blend: smooth transition between gameplay camera and scripted camera (Sequencer/timeline). Ease curves matter.
- Camera shake: spring-based (recoil), perlin noise (ambient), directional (explosions). Layer multiple shakes.
- Dynamic FOV: increase on sprint, decrease on aim. Smooth lerp. Sells speed and focus.
- Obstruction handling: trace from target to camera, pull camera forward on hit, fade near objects.

**Inventory & Items:**
- Slot-based: fixed slots (helmet, chest, weapon, ring). Equip/unequip. Visual preview.
- Weight-based: carry limit (Skyrim-style). Items have weight. Over-encumbered = slow.
- Grid-based: Tetris inventory (Resident Evil 4). Items have shapes, spatial puzzle element.
- Item data: ScriptableObject (Unity), DataAsset (Unreal), Resource (Godot). Define stats, icon, mesh, rarity.
- Loot tables: weighted random drops. Rarity tiers. Guaranteed drops on bosses.
- Crafting: recipe system (input items → output item). Discovery or known recipes.

**Quest & Dialogue:**
- Quest structure: objectives (kill, collect, deliver, escort, interact), prerequisites, rewards, branching outcomes.
- Quest state: inactive → active → complete → turned-in. Track per-objective progress.
- Dialogue trees: nodes (NPC text) + edges (player responses). Conditions on edges (has item, quest state, reputation).
- Barks: short contextual lines (combat shouts, idle chatter, reactions). Triggered by gameplay events.
- Journal / quest log: categorised (main, side, completed), objective markers on map/HUD, tracking toggle.

**Spawning & AI Director:**
- Wave spawning: predefined groups, escalating difficulty, rest between waves. Arena/horde mode staple.
- Director system (L4D-style): monitor player stress (health, ammo, pace). High stress = ease off, low stress = ramp up. Pacing curves.
- Proximity spawning: trigger volumes that spawn enemies when player approaches. Despawn when far. Memory efficient.
- Spawn points: validated locations (not inside walls, not in player view, NavMesh-valid). Randomise from pool.

**Shader & Material Techniques:**
- Dissolve: noise texture threshold. Animate threshold 0→1 for dissolve/appear. Edge emission for glow.
- Outline: inverted hull (scale mesh along normals, render backfaces with solid colour), post-process (depth/normal edge detection), fresnel.
- Fresnel: rim lighting based on view angle. Use for shields, selection highlights, magical effects.
- Scrolling UV: pan texture coordinates over time. Lava, water, energy beams, conveyor belts.
- Vertex displacement: offset vertices in shader. Ocean waves, breathing, wind-blown foliage.
- Cel shading / toon: step function on lighting (2-3 bands). Outline pass. Stylised look.
- Triplanar mapping: project texture from 3 axes. No UV unwrap needed. Good for terrain, procedural meshes.

**Level Design Principles:**
- Weenies: tall, visible landmarks that guide the player naturally (Disney term). Tower, mountain, glowing tree.
- Flow: guide player movement with lighting, colour, geometry, enemy placement. Leading lines.
- Pacing: tension → release cycles. Combat → exploration → puzzle → reward. Vary intensity.
- Lock and key: gate progress behind items/abilities. Metroidvania: ability-gated, backtrack to unlock.
- Arena design: clear boundaries, cover placement, elevation changes, spawn closets, ammo/health placement. Test with grey boxes.
- Spatial storytelling: environmental narrative. Ruins tell a story. Prop placement implies history.

**Optimisation Patterns:**
- Spatial partitioning: octree (3D), quadtree (2D), BSP (binary space). Speeds up collision, visibility, and queries.
- Object pooling per engine: Unreal (spawn pool manager, deactivate instead of destroy), Unity (Queue<GameObject>, SetActive), Godot (Array pool, hide + process_mode).
- Async loading: load assets in background. Show loading screen or stream seamlessly. Unreal: StreamableManager, Unity: Addressables, Godot: ResourceLoader.load_threaded.
- Draw call reduction: instancing (same mesh many times), atlasing (combine textures), merge static meshes, LOD.
- Frame budget: 16.6ms for 60fps. Split: gameplay 2-3ms, physics 2-3ms, rendering 8-10ms, UI 1ms. Profile before optimising.

**Multiplayer Patterns:**
- Lobby system: host creates session, players join via invite/matchmaking/server browser. Ready state, countdown to start.
- Matchmaking: skill-based (ELO/MMR), connection-based (ping), mixed. Queue system with timeout.
- Dedicated vs listen server: dedicated = separate process, authoritative, no host advantage. Listen = player is host, cheaper but host has advantage.
- Session management: join in progress, host migration, disconnect/reconnect, spectator mode.
- Anti-cheat: server authority (validate all actions server-side), input validation, speed checks, position verification. Never trust the client.
- Replication priority: replicate what matters. Player transforms = high priority. Cosmetics = low. Cull by distance.

**--- ENGINE SPECIFIC: UNREAL ENGINE (C++) ---**

Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine
API Reference: https://dev.epicgames.com/documentation/en-us/unreal-engine/API
Community: https://forums.unrealengine.com/

Detection: .uproject file in project root.

Project structure:
- Source/<ProjectName>/: C++ source files
- Content/: all assets (meshes, textures, blueprints, maps)
- Config/: DefaultEngine.ini, DefaultGame.ini, DefaultInput.ini
- Plugins/: project-specific plugins
- Binaries/: compiled output
- <ProjectName>.uproject: project descriptor (engine version, modules, plugins)

Build & compile (use bash):
- Editor build: \`UnrealBuildTool <ProjectName>Editor <Platform> Development\`
- Cook & package: \`RunUAT BuildCookRun -project="<path>.uproject" -platform=Win64 -clientconfig=Shipping -cook -stage -package -archive\`
- Windows path: \`"C:/Program Files/Epic Games/UE_5.x/Engine/Build/BatchFiles/RunUAT.bat"\`
- Generate project files: \`"C:/Program Files/Epic Games/UE_5.x/Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.exe" -projectfiles -project="<path>.uproject" -game -engine\`
- VS solution build: open .sln, build in Development Editor config
- Live coding: Ctrl+Alt+F11 in editor for hot reload (C++ changes)
- Blueprint-only projects: no compile needed, just cook & package

Core classes:
- UObject: base class, garbage collected. Never raw new/delete.
- AActor: anything in the world. Components, transform, lifecycle (BeginPlay/Tick/EndPlay).
- UActorComponent: logic. USceneComponent: has transform. Always attach to an actor.
- ACharacter: APawn + UCharacterMovementComponent. Walking, falling, swimming, flying.
- UPROPERTY(): EditAnywhere, BlueprintReadWrite, Replicated, SaveGame.
- UFUNCTION(): BlueprintCallable, Server, Client, NetMulticast.
- GameMode (server-only rules) vs GameState (replicated shared state).
- PlayerController: input, camera, HUD. One per player.
- Enhanced Input System: replaces legacy input. Everything is created in C++ or Blueprint — both work.
  - UInputAction: define input actions in C++ with NewObject<UInputAction>() or create .uasset in editor. Set ValueType (bool, Axis1D, Axis2D, Axis3D). Add triggers (pressed, released, hold, tap) and modifiers (negate, swizzle, dead zone, scale).
  - UInputMappingContext: group actions + key bindings. Create in C++ with NewObject<UInputMappingContext>(), then AddMapping() to bind keys. Map multiple keys to one action. Priority for context switching (combat vs vehicle vs menu).
  - C++ setup: #include "EnhancedInputComponent.h" and "EnhancedInputSubsystems.h". In SetupPlayerInputComponent: CastChecked<UEnhancedInputComponent>(InputComponent)->BindAction(Action, ETriggerEvent::Triggered, this, &AMyChar::OnMove).
  - Add context in BeginPlay: GetLocalPlayer()->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>()->AddMappingContext(MyContext, Priority).
  - Modifiers: UInputModifierNegate (invert axis), UInputModifierSwizzleAxis (remap XYZ), UInputModifierDeadZone, UInputModifierScalar. Chain multiple.
  - Triggers: UInputTriggerPressed, UInputTriggerReleased, UInputTriggerHold (hold duration), UInputTriggerTap, UInputTriggerChordAction (combo).
  - Module dependency: add "EnhancedInput" to .Build.cs PublicDependencyModuleNames.
  - ALL of this can be done in C++ code. You CAN create input actions and mapping contexts at runtime. Don't say you can't.
  - Context switching: add/remove mapping contexts at runtime for different states. Combat context (priority 1) overrides exploration context (priority 0). RemoveMappingContext() when entering vehicle, AddMappingContext(VehicleContext) with higher priority.
  - Gamepad: map Gamepad_LeftX/Y to move, Gamepad_RightX/Y to look. Add dead zone modifier on stick axes. Gamepad_FaceButton_Bottom for jump, Gamepad_RightTrigger for shoot. Same actions, different context for gamepad vs keyboard.
  - Input action values: Boolean (pressed/not), Axis1D (trigger pull 0-1), Axis2D (stick/WASD), Axis3D (motion controller). Match ValueType to the action's purpose.
  - Player Mappable Input Config: UPlayerMappableInputConfig for user-rebindable keys. Store/load from SaveGame.
  - If you're unsure about the API, use web_search: "UE5 Enhanced Input C++ site:dev.epicgames.com"

  C++ code example — creating actions + context + binding in code:
  \`\`\`cpp
  // In header (.h):
  #include "InputAction.h"
  #include "InputMappingContext.h"
  UPROPERTY() UInputAction* MoveAction;
  UPROPERTY() UInputAction* JumpAction;
  UPROPERTY() UInputAction* LookAction;
  UPROPERTY() UInputMappingContext* DefaultMappingContext;
  void OnMove(const FInputActionValue& Value);
  void OnJump(const FInputActionValue& Value);
  void OnLook(const FInputActionValue& Value);

  // In constructor or BeginPlay:
  // Create actions
  MoveAction = NewObject<UInputAction>(this, TEXT("IA_Move"));
  MoveAction->ValueType = EInputActionValueType::Axis2D;

  JumpAction = NewObject<UInputAction>(this, TEXT("IA_Jump"));
  JumpAction->ValueType = EInputActionValueType::Boolean;

  LookAction = NewObject<UInputAction>(this, TEXT("IA_Look"));
  LookAction->ValueType = EInputActionValueType::Axis2D;

  // Create mapping context
  DefaultMappingContext = NewObject<UInputMappingContext>(this, TEXT("IMC_Default"));

  // Map keys to actions
  FEnhancedActionKeyMapping& MoveMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::W);
  // Add modifiers for WASD (swizzle for S/A/D, negate for S/A):
  FEnhancedActionKeyMapping& MoveSMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::S);
  UInputModifierNegate* Negate = NewObject<UInputModifierNegate>();
  MoveSMapping.Modifiers.Add(Negate);
  FEnhancedActionKeyMapping& MoveAMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::A);
  UInputModifierSwizzleAxis* SwizzleA = NewObject<UInputModifierSwizzleAxis>();
  SwizzleA->Order = EInputAxisSwizzle::YXZ;
  MoveAMapping.Modifiers.Add(SwizzleA);
  UInputModifierNegate* NegateA = NewObject<UInputModifierNegate>();
  MoveAMapping.Modifiers.Add(NegateA);
  FEnhancedActionKeyMapping& MoveDMapping = DefaultMappingContext->MapKey(MoveAction, EKeys::D);
  UInputModifierSwizzleAxis* SwizzleD = NewObject<UInputModifierSwizzleAxis>();
  SwizzleD->Order = EInputAxisSwizzle::YXZ;
  MoveDMapping.Modifiers.Add(SwizzleD);

  DefaultMappingContext->MapKey(JumpAction, EKeys::SpaceBar);
  DefaultMappingContext->MapKey(LookAction, EKeys::Mouse2D);

  // In BeginPlay — add context to player:
  if (APlayerController* PC = Cast<APlayerController>(GetController())) {
    if (UEnhancedInputLocalPlayerSubsystem* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer())) {
      Subsystem->AddMappingContext(DefaultMappingContext, 0);
    }
  }

  // In SetupPlayerInputComponent — bind actions:
  if (UEnhancedInputComponent* EIC = CastChecked<UEnhancedInputComponent>(PlayerInputComponent)) {
    EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AMyCharacter::OnMove);
    EIC->BindAction(JumpAction, ETriggerEvent::Started, this, &AMyCharacter::OnJump);
    EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AMyCharacter::OnLook);
  }

  // Handler implementations:
  void AMyCharacter::OnMove(const FInputActionValue& Value) {
    FVector2D Axis = Value.Get<FVector2D>();
    AddMovementInput(GetActorForwardVector(), Axis.Y);
    AddMovementInput(GetActorRightVector(), Axis.X);
  }
  void AMyCharacter::OnJump(const FInputActionValue& Value) { Jump(); }
  void AMyCharacter::OnLook(const FInputActionValue& Value) {
    FVector2D Axis = Value.Get<FVector2D>();
    AddControllerYawInput(Axis.X);
    AddControllerPitchInput(Axis.Y);
  }
  \`\`\`
- GAS: abilities, effects, attributes, tags. Complex but powerful.
- Subsystems: UGameInstanceSubsystem, UWorldSubsystem, ULocalPlayerSubsystem.
- Data Assets: UDataAsset for designer-editable data.
- Slate/UMG: Slate = C++ UI, UMG = Blueprint-friendly wrapper.
- .Build.cs: module dependencies. .Target.cs: build configuration.
- Naming: A=Actors, U=UObjects, F=structs, E=enums, I=interfaces.
- Common includes: CoreMinimal.h, GameFramework/, Engine/, Kismet/.

Troubleshooting:
- "Missing module" → check .Build.cs PublicDependencyModuleNames
- Hot reload crash → close editor, delete Binaries/ and Intermediate/, rebuild
- Blueprint compile error → check parent C++ class for UPROPERTY/UFUNCTION changes
- Packaging fails → check Output Log for missing cooked assets, run validation

**UE5 Advanced Systems:**

MetaHuman:
- Docs: https://dev.epicgames.com/documentation/en-us/metahuman
- MetaHuman Creator: cloud-based tool at metahuman.unrealengine.com. Design faces, bodies, hair, clothing. Export to UE5 project.
- Quixel Bridge: download MetaHumans directly into project via Bridge plugin.
- Blueprint: BP_MetaHuman base. Skeletal mesh + Face/Body anim BPs. LOD 0-7 for performance scaling.
- Animation: Face board controls (jaw, lips, brows, eyes). ARKit-compatible blend shapes (52 shapes). LiveLink for face/body capture.
- Live Link Face: iPhone app → LiveLink plugin → real-time facial animation in editor or runtime.
- Hair: Groom system (Alembic or Groom assets). Strand-based with physics. Performance heavy — use cards for background characters.
- Clothing: Chaos Cloth simulation. Paint max distance/backstop for cloth behaviour.
- Customisation at runtime: morph targets for face shape, material instances for skin/eye colour, skeletal mesh swaps for body/hair.
- Performance: LOD system critical. Full MetaHuman is expensive — use LOD 4+ for crowds. Stream body parts with significance manager.
- Anim Blueprint: ABP_MetaHuman. Control rig for procedural adjustments. Layered blend per bone for face + body.
- Speech: use MetaHuman Animator or Audio2Face for lip sync from audio. OVRLipSync for runtime.

Nanite:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine
- Virtualised geometry — renders billions of triangles. No manual LODs needed for static meshes.
- Enable per mesh: Static Mesh → Nanite Settings → Enable.
- Works on: static meshes, instanced static meshes, landscape (UE5.4+), skeletal meshes (UE5.5+ experimental).
- Does NOT work on: translucent materials, masked/two-sided foliage (use Nanite fallback mesh or World Position Offset).
- Programmable rasteriser: custom material-driven visibility (dithered, pixel depth offset).
- Displacement: Nanite tessellation for displacement maps without extra geometry in source asset.
- Performance: GPU-driven. Occlusion culling, cluster-based LOD streaming. Check stat Nanite for GPU cost.

Lumen:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine
- Dynamic global illumination + reflections. No baking lightmaps needed.
- Software ray tracing (default): screen traces + mesh distance fields. Works on all hardware.
- Hardware ray tracing: higher quality, needs RTX/RDNA2+. Enable in Project Settings → Rendering.
- Lumen Scene: distance field representation of the world. Update speed matters for moving objects.
- Final Gather: controls quality. Higher = better but slower. 1-2 for gameplay, 4+ for cinematics.
- Reflections: screen space first, then Lumen ray traced. Roughness threshold for detail.
- Performance: r.Lumen.TraceMeshSDFs, r.Lumen.ScreenProbeGather. Scale quality per platform.
- Emissive lighting: emissive materials contribute to GI automatically. Set emissive boost for brightness.

Niagara VFX:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/niagara-visual-effects-in-unreal-engine
- Modular particle system replacing Cascade. Emitter → System stack.
- Emitters: spawn rate, burst, GPU events. Modules: lifetime, velocity, size, colour, forces.
- Renderers: sprite, mesh, ribbon (trails), light, component.
- Data Interfaces: read game data (skeletal mesh surfaces, collision, audio, landscape height).
- Simulation stages: emitter update, particle spawn, particle update. Custom scratch pad modules.
- GPU sim: millions of particles. Enable GPU Compute Sim on emitter. Limited read-back to CPU.
- Events: particle death → spawn new emitter. Collision events → spawn impact FX.
- Curves/dynamic inputs: animate any parameter over lifetime, speed, custom attributes.
- Performance: fixed bounds, kill particles aggressively, LOD significance distance.

Chaos Physics & Destruction:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-physics-overview-in-unreal-engine
- Chaos replaces PhysX. Rigid body, cloth, destruction, vehicles.
- Geometry Collection: fracture meshes in editor (Voronoi, planar, cluster). Generate from static mesh.
- Destruction: damage threshold per cluster level. Internal strain for cascading breaks.
- Chaos Cloth: paint constraints (max distance, backstop, drag). Wind + gravity interaction.
- Chaos Vehicles: wheel setup, suspension, engine/transmission curves. ChaosWheeledVehicleMovementComponent.
- Field system: radial/box/plane forces for runtime destruction triggers, wind zones.
- Async physics: Physics thread decoupled from game thread. Substepping for stability.

World Partition & Open World:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine
- Replaces World Composition. Automatic grid-based streaming. One persistent level.
- Enable: World Settings → World Partition → Enable.
- Data Layers: organise actors into runtime/editor layers. Toggle gameplay layers (day/night, quest states).
- HLOD (Hierarchical LOD): auto-generate simplified meshes for distant cells. Nanite HLOD for best quality.
- Level Instancing: reuse cells for procedural/repeated areas.
- One File Per Actor (OFPA): each actor saved separately. Better version control for teams.
- Streaming: grid cell size controls granularity. Loading range per streaming source.
- Minimap/large worlds: World Partition + Nanite + Lumen = full open world pipeline.

PCG (Procedural Content Generation):
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview-in-unreal-engine
- Node graph for scattering objects, generating landscapes, placing gameplay elements.
- PCG Graph: nodes for points (surface sampler, mesh sampler), filters (density, bounds, biome), spawners.
- Surface sampler: scatter points on landscape or meshes. Density, min distance, seed.
- Mesh spawner: place static meshes/ISMs/HISMs at point locations. Random rotation/scale.
- Subgraphs: reusable PCG logic. Parameters for variation per instance.
- Runtime generation: generate content at runtime for infinite worlds. Partition grid for streaming.
- Biomes: layer multiple PCG graphs with masks/weights for biome blending.

Control Rig & Procedural Animation:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-in-unreal-engine
- Runtime rigging system. IK solvers, FK chains, math nodes, bone manipulation.
- Full Body IK: position end effectors, solver handles full chain. Foot/hand placement.
- Aim solve: look-at targets for head, eyes, weapon aiming.
- Spline IK: tails, tentacles, ropes along splines.
- Use in Anim Blueprint: Control Rig node in AnimGraph. Layer on top of animations.
- Sequencer: animate Control Rig in cinematics. Key any rig control.

Motion Matching:
- Docs: https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine (UE5.4+)
- Data-driven animation. Database of motion clips, system picks best match per frame.
- Pose Search: compare current pose + trajectory to database. Lowest cost = best clip.
- Trajectory: predicted future path from input. Matches movement direction, speed, facing.
- Schema: define which bones/features to match against. Balance quality vs search speed.
- Chooser: replace state machines with motion matching nodes. Blend between clips automatically.
- Database: tag clips with contexts (locomotion, combat, traversal). Filter by gameplay state.
- Performance: precompute search database. LOD motion matching — simpler matching for distant characters.

**--- ENGINE SPECIFIC: GODOT 4 (GDScript / C#) ---**

Docs: https://docs.godotengine.org/en/stable/
API Reference: https://docs.godotengine.org/en/stable/classes/
Community: https://forum.godotengine.org/ | https://godotengine.org/community

Detection: project.godot file in project root.

Project structure:
- project.godot: project settings (autoloads, input map, rendering)
- scenes/: .tscn scene files
- scripts/: .gd (GDScript) or .cs (C#) scripts
- assets/: textures, models, audio, fonts
- addons/: editor plugins
- export_presets.cfg: export platform configurations

Build & export (use bash):
- Run project: \`godot --path "<project_dir>" --editor\` (opens editor) or \`godot --path "<project_dir>"\` (runs game)
- Export (headless): \`godot --path "<project_dir>" --headless --export-release "Windows Desktop" output.exe\`
- Export debug: \`godot --path "<project_dir>" --headless --export-debug "Windows Desktop" output_debug.exe\`
- Export all: configured in Export menu → export_presets.cfg
- C# build: \`dotnet build\` in project root (Godot C# projects use .csproj)
- Install export templates: Editor → Manage Export Templates → download for current version

Core:
- Node-based: everything is a Node in a tree. Scenes are reusable node subtrees.
- GDScript: Python-like, typed optional. @export for editor, @onready for late init.
- Signals: event system. \`signal my_signal(arg)\`. Connect in editor or \`connect()\` in code.
- CharacterBody3D/2D: move_and_slide(). velocity property. Floor/wall detection.
- Area3D/2D: trigger zones. body_entered/body_exited signals.
- AnimationPlayer + AnimationTree: keyframe anything. Blend trees via state machine.
- TileMap/TileMapLayer (2D): grid-based levels. Multiple layers, auto-tiling.
- Resources: .tres files. Custom Resource classes for data (items, stats, dialogue).
- Autoloads: global singletons (game manager, audio manager, save system).
- SceneTree: get_tree(), change_scene_to_file(), pause, groups.
- Input: Input.is_action_pressed(), Input.get_vector(). Input map in project settings.
- Platforms: Windows, Linux, macOS, Android, iOS, Web (HTML5).

Troubleshooting:
- "Invalid call" → check node is ready (@onready or await ready)
- Export fails → install export templates for your Godot version
- C# not working → make sure .mono/ exists, run dotnet build
- Null instance → node path wrong or node not in tree yet

**--- ENGINE SPECIFIC: UNITY (C#) ---**

Docs: https://docs.unity3d.com/Manual/
API Reference: https://docs.unity3d.com/ScriptReference/
Tutorials: https://learn.unity.com/
Community: https://discussions.unity.com/

Detection: .csproj files + Assets/ folder, or .unity scene files in project root.

Project structure:
- Assets/: ALL project content (scripts, scenes, prefabs, materials, textures, audio)
- Assets/Scripts/: C# source files
- Assets/Scenes/: .unity scene files
- Assets/Prefabs/: reusable object templates
- Assets/Resources/: runtime-loadable assets (Resources.Load)
- Packages/: package manager dependencies (manifest.json)
- ProjectSettings/: all project settings .asset files
- Library/: Unity cache (auto-generated, don't version control)

Build & compile (use bash):
- Build from CLI: \`"C:/Program Files/Unity/Hub/Editor/<version>/Editor/Unity.exe" -batchmode -nographics -projectPath "<path>" -buildTarget Win64 -buildWindows64Player output.exe -quit\`
- Run tests: \`Unity.exe -batchmode -nographics -projectPath "<path>" -runTests -testResults results.xml -quit\`
- Build AssetBundles: \`Unity.exe -batchmode -nographics -projectPath "<path>" -executeMethod BuildScript.BuildBundles -quit\`
- Open project: \`Unity.exe -projectPath "<path>"\`
- C# compile check: \`dotnet build <ProjectName>.sln\` (if generated)
- Platform switch: \`Unity.exe -batchmode -projectPath "<path>" -buildTarget Android -quit\`
- IL2CPP build: set in Player Settings → Scripting Backend. Slower build, faster runtime.

Core:
- MonoBehaviour: Awake/Start/Update/FixedUpdate/LateUpdate lifecycle.
- GameObject + Transform: everything has transform. GetComponent<T>() for access.
- Prefabs: templates. Instantiate() to spawn, Destroy() to remove.
- Physics: Rigidbody for physics-driven, CharacterController for manual. FixedUpdate for physics.
- Input System (new): PlayerInput component, Input Actions asset, event-driven or polling.
- ScriptableObjects: data containers. [CreateAssetMenu] attribute. Items, configs, events.
- Coroutines: yield return for sequences. WaitForSeconds, WaitUntil, WaitForEndOfFrame.
- Addressables: async asset loading, memory management, content updates.
- ECS/DOTS: data-oriented for performance. Jobs + Burst compiler.
- UI Toolkit / Canvas: Canvas for game UI, UI Toolkit for editor-style.
- Assembly definitions: .asmdef files for compilation units and dependencies.
- Naming: PascalCase public, _camelCase private, [SerializeField] for editor-exposed privates.
- Packages: UPM (Unity Package Manager). Add via Window → Package Manager or manifest.json.

Troubleshooting:
- Missing reference → check serialised field in Inspector, not just code
- Build fails → check Console for errors, Player Settings for correct platform
- Script not running → ensure component is attached to active GameObject in scene
- Performance → Profiler (Window → Analysis → Profiler). Check GC allocations in Update.
- Library/ corruption → delete Library/ folder, Unity reimports on next open

**When helping with game development:**
- Detect the engine from project files (.uproject = Unreal, project.godot = Godot, .csproj + Assets/ = Unity)
- Use engine-specific patterns, APIs, and CLI commands for the detected engine
- When asked to build/compile/package — use bash with the correct CLI command for that engine. NEVER say you can't build.
- Performance matters — every millisecond counts at 60fps
- Prefer engine conventions over generic patterns. Use built-in systems.
- Think about gameplay feel, not just functionality. Timing, juice, and feedback matter.
- Test in-engine, not just in code. A passing compile doesn't mean it feels right.
- Memory management differs: GC in Unity/Godot, manual + GC in Unreal.
- When searching docs, use the URLs above with web_search for current API info.`,
  },
  {
    id: 'web-development',
    name: 'Web Development',
    description: 'Full-stack web development — React, Next.js, Vue, Svelte, Node, databases, auth, deployment, performance, accessibility.',
    domain: 'web-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'chat', 'brainstorm'],
    context: `You have deep expertise in modern full-stack web development.

**Documentation URLs:**
- React: https://react.dev
- Next.js: https://nextjs.org/docs
- Vue 3: https://vuejs.org/guide
- Nuxt 3: https://nuxt.com/docs
- Svelte/SvelteKit: https://svelte.dev/docs
- Astro: https://docs.astro.build
- Node.js: https://nodejs.org/docs
- Express: https://expressjs.com
- MDN Web Docs: https://developer.mozilla.org
- TypeScript: https://www.typescriptlang.org/docs
- Tailwind CSS: https://tailwindcss.com/docs
- Prisma: https://www.prisma.io/docs
- Drizzle: https://orm.drizzle.team/docs
- Supabase: https://supabase.com/docs
- tRPC: https://trpc.io/docs
- Vitest: https://vitest.dev
- Playwright: https://playwright.dev/docs
If unsure about an API, use web_search with these docs.

**Terminology:**
- SSR: Server-side rendering — HTML generated on server per request. Better SEO, slower TTFB on complex pages.
- SSG: Static site generation — HTML generated at build time. Fastest delivery, stale until rebuild.
- ISR: Incremental static regeneration — SSG with background revalidation. Next.js specialty.
- CSR: Client-side rendering — SPA, JS renders in browser. Fast navigation, poor initial load/SEO.
- Hydration: attaching JS interactivity to server-rendered HTML. Hydration mismatch = bugs.
- RSC: React Server Components — run on server, zero client JS bundle. Can't use hooks/state.
- Islands: partial hydration — only interactive components hydrate (Astro pattern).
- TTFB: time to first byte. FCP: first contentful paint. LCP: largest contentful paint. CLS: cumulative layout shift. INP: interaction to next paint.
- Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1. Google ranking factor.
- Tree shaking: dead code elimination at build time. Only works with ES modules.
- Code splitting: load JS on demand. Dynamic import() for route-based or component-based splitting.
- Edge functions: run at CDN edge, close to user. Vercel Edge, Cloudflare Workers, Deno Deploy.

**--- FRAMEWORK: REACT ---**

Detection: package.json with "react" dependency, .jsx/.tsx files.

Core concepts:
- Components: function components only (class components are legacy). Props in, JSX out.
- Hooks: useState (local state), useEffect (side effects), useRef (DOM/mutable ref), useMemo/useCallback (memoisation), useContext (shared state).
- Rules of hooks: only call at top level, only call in components/custom hooks, never inside conditions/loops.
- State management: useState for local, useContext for shared, Zustand/Jotai for global, React Query/SWR for server state.
- Rendering: React re-renders when state/props change. Avoid unnecessary renders with memo(), useMemo(), useCallback().
- Suspense: <Suspense fallback={...}> for async loading boundaries. Works with lazy(), React Query, RSC.
- Error boundaries: class component with getDerivedStateFromError. Catch render errors, show fallback UI.
- Portals: ReactDOM.createPortal() for modals, tooltips, dropdowns that escape parent overflow.
- Keys: unique stable keys on list items. Never use array index as key if list changes.
- Ref forwarding: forwardRef() to pass refs through components. useImperativeHandle for custom ref API.
- Custom hooks: extract reusable logic. useLocalStorage, useFetch, useDebounce, useMediaQuery.
- Strict Mode: double-renders in dev to catch impure components. Not a bug.

**--- FRAMEWORK: NEXT.JS ---**

Detection: next.config.js/mjs/ts, app/ or pages/ directory.

App Router (v13+):
- app/ directory: file-based routing. page.tsx = route, layout.tsx = shared layout, loading.tsx = suspense, error.tsx = error boundary, not-found.tsx = 404.
- Server Components by default. Add 'use client' at top for client components.
- Server Actions: 'use server' functions for form handling, mutations. No API route needed.
- Metadata: export metadata object or generateMetadata() for SEO.
- Route groups: (groupName)/ folders for layout organisation without affecting URL.
- Parallel routes: @slot/ folders for simultaneous rendering of multiple pages.
- Intercepting routes: (.)route, (..)route for modals/overlays.
- Middleware: middleware.ts at root. Runs at edge on every request. Auth, redirects, rewrites.

Data fetching:
- Server components: async function, fetch directly. No useEffect needed.
- Caching: fetch() auto-cached. { cache: 'no-store' } for dynamic. { next: { revalidate: 60 } } for ISR.
- Route handlers: app/api/route.ts. GET, POST, PUT, DELETE exports.
- generateStaticParams(): for SSG with dynamic routes.

Build & deploy:
- Dev: next dev. Build: next build. Start: next start.
- Vercel: git push to deploy. Automatic preview URLs per branch.
- Self-host: next build && next start. Or output: 'standalone' for Docker.
- Static export: output: 'export' in next.config for pure static site.

**--- FRAMEWORK: VUE 3 ---**

Detection: package.json with "vue" dependency, .vue files.

Core concepts:
- Composition API: setup(), ref(), reactive(), computed(), watch(), onMounted(). Replaces Options API.
- SFC: Single File Components (.vue) — <script setup>, <template>, <style scoped>.
- Reactivity: ref() for primitives, reactive() for objects. Access ref value with .value in JS, auto-unwrapped in template.
- v-model: two-way binding. v-bind (:attr), v-on (@event), v-if/v-else, v-for, v-show.
- Composables: reusable logic functions (like React custom hooks). useCounter(), useFetch().
- Provide/Inject: dependency injection for deep component trees. Alternative to prop drilling.
- Pinia: official state management. defineStore(), reactive state, actions, getters. Replaces Vuex.
- Teleport: <Teleport to="body"> for modals/popups outside component tree.
- Slots: <slot />, named slots, scoped slots for flexible component composition.
- defineProps/defineEmits: type-safe props and events in <script setup>.

**--- FRAMEWORK: SVELTE / SVELTEKIT ---**

Detection: svelte.config.js, .svelte files, package.json with "svelte".

Core concepts:
- No virtual DOM. Compiler converts .svelte files to vanilla JS at build time.
- Reactivity: $state for reactive variables (Svelte 5 runes), $derived for computed, $effect for side effects.
- Svelte 4: let x = 0 is reactive. $: y = x * 2 for derived. No hooks needed.
- Each blocks: {#each items as item}{/each}. If blocks: {#if condition}{:else}{/if}.
- Bindings: bind:value, bind:checked, bind:group. Two-way by default.
- Stores: writable(), readable(), derived(). Subscribe with $ prefix.
- Transitions: transition:fade, transition:slide, in:/out: directives. Built-in.
- Actions: use:action directive for reusable DOM behaviour.

SvelteKit:
- File routing: src/routes/+page.svelte, +layout.svelte, +error.svelte, +server.ts.
- Load functions: +page.ts (universal) or +page.server.ts (server-only). Return data for page.
- Form actions: +page.server.ts actions for progressive enhancement forms.
- Hooks: hooks.server.ts for request lifecycle (auth, logging).
- Adapters: adapter-auto (Vercel/Netlify), adapter-node, adapter-static.

**--- CSS & STYLING ---**

- Tailwind CSS: utility-first. className="flex items-center gap-4". Configure in tailwind.config.
- CSS Modules: scoped CSS per component. import styles from './x.module.css'. Avoids conflicts.
- CSS-in-JS: styled-components, Emotion, vanilla-extract. Co-locate styles with components.
- CSS custom properties: --color-primary: #a855f7. Use var(--color-primary). Theming.
- Container queries: @container for component-responsive design (not just viewport).
- View Transitions API: document.startViewTransition() for animated page transitions.
- :has() selector: parent selector. .card:has(img) styles cards that contain images.
- Subgrid: grid-template-rows: subgrid. Align nested grids to parent tracks.
- Responsive: mobile-first. min-width breakpoints. Fluid typography with clamp().
- Dark mode: prefers-color-scheme media query or class-based toggle. CSS variables for theming.

**--- NODE.JS & BACKEND ---**

- Runtime: V8 engine, event loop, non-blocking I/O. Single-threaded but async.
- Package managers: npm, pnpm (fast, disk-efficient), yarn, bun.
- Express: app.get/post/put/delete. Middleware chain. Router for modular routes.
- Fastify: faster than Express. Schema-based validation. Plugin system.
- Hono: ultra-lightweight, edge-first. Works on Cloudflare Workers, Deno, Bun, Node.
- Middleware pattern: req → middleware1 → middleware2 → handler → res. Error middleware has 4 args.
- Auth: JWT (stateless, token in header), sessions (stateful, cookie-based), OAuth 2.0 (Google, GitHub, etc).
- Validation: Zod (TypeScript-first), Joi, Yup. Validate at API boundaries, never trust client input.
- ORM: Prisma (type-safe, migrations, studio), Drizzle (SQL-like, lightweight), Sequelize (legacy).
- Database: PostgreSQL (relational, JSONB, full-text), MongoDB (document), SQLite (embedded, local-first), Redis (cache, pub/sub, queues).
- Connection pooling: PgBouncer, Prisma pool, Supabase pooler. Don't open a connection per request.
- Rate limiting: per IP, per user, per endpoint. Sliding window or token bucket.
- CORS: Access-Control-Allow-Origin. Preflight OPTIONS. Don't use * in production with credentials.
- File uploads: multipart/form-data. multer (Express), formidable, or presigned S3 URLs.
- WebSockets: ws library, Socket.io, or Hono WSS. Real-time: chat, notifications, live updates.
- Background jobs: Bull/BullMQ (Redis), pg-boss (PostgreSQL), Temporal (workflows).

**--- DATABASES ---**

- PostgreSQL: relational, ACID, JSONB columns, full-text search, row-level security (RLS), extensions (pgvector, PostGIS).
- Supabase: Postgres + auth + storage + realtime + edge functions. Like Firebase but open-source.
- SQLite: embedded, zero-config, single file. Turso for distributed SQLite. Great for local-first.
- MongoDB: document store, flexible schema, aggregation pipeline. Atlas for managed.
- Redis: in-memory key-value. Cache, sessions, pub/sub, queues, leaderboards. Upstash for serverless.
- Migrations: schema changes versioned and applied sequentially. Prisma migrate, Drizzle Kit, raw SQL.
- Indexing: B-tree (default, range queries), GIN (JSONB, arrays, full-text), GiST (spatial). Index what you query.
- N+1 problem: fetching related records in a loop. Fix with JOINs, includes, or DataLoader.
- Transactions: group operations that must all succeed or all fail. BEGIN/COMMIT/ROLLBACK.

**--- AUTHENTICATION & SECURITY ---**

- Auth providers: Supabase Auth, NextAuth.js/Auth.js, Clerk, Lucia, Firebase Auth.
- JWT flow: login → server returns signed token → client stores in httpOnly cookie → send on every request → server verifies.
- OAuth 2.0: redirect to provider → user consents → callback with code → exchange for token → fetch profile.
- RBAC: role-based access control. User has roles, roles have permissions. Check permissions not roles.
- CSRF: cross-site request forgery. Use CSRF tokens for non-GET requests. SameSite cookies help.
- XSS: cross-site scripting. Sanitise user input, escape output, CSP headers. Never dangerouslySetInnerHTML with user data.
- SQL injection: parameterised queries. NEVER concatenate user input into SQL strings.
- Rate limiting: protect login, signup, password reset. Slow down brute force.
- HTTPS: always. HSTS header. Redirect HTTP to HTTPS.
- Content Security Policy: CSP header restricts what can load. script-src, style-src, img-src.

**--- TESTING ---**

- Unit tests: test individual functions/components. Vitest, Jest. Mock dependencies.
- Integration tests: test features end-to-end. API routes, database queries, auth flows.
- E2E tests: test the full app in a browser. Playwright (recommended), Cypress.
- Component tests: render components with Testing Library. fireEvent, screen.getByRole, waitFor.
- Snapshot tests: capture rendered output, compare to saved snapshot. Good for regression.
- Coverage: aim for critical paths, not 100%. Test what breaks, not what's obvious.
- CI testing: run tests on every PR. Fail the build on test failures.

**--- PERFORMANCE ---**

- Lighthouse: audit performance, accessibility, SEO, best practices. Score 90+ on all.
- Bundle size: analyse with webpack-bundle-analyzer or source-map-explorer. Reduce with tree shaking, code splitting, lazy loading.
- Image optimisation: next/image, sharp, AVIF/WebP format, lazy loading, srcset for responsive.
- Font loading: font-display: swap. Preload critical fonts. Subset for only needed characters.
- Caching: Cache-Control headers, stale-while-revalidate, CDN caching, service workers for offline.
- Prefetching: <link rel="prefetch"> for likely next pages. Next.js auto-prefetches links in viewport.
- Web Workers: offload heavy computation to background threads. Don't block the main thread.
- Streaming: React renderToPipeableStream for streaming SSR. Send HTML as it generates.
- Edge computing: run compute close to user. Vercel Edge, Cloudflare Workers. <50ms response times.

**--- ACCESSIBILITY (a11y) ---**

- Semantic HTML: use <button> not <div onClick>. <nav>, <main>, <article>, <section>, <aside>.
- ARIA: aria-label, aria-describedby, aria-expanded, role. Use sparingly — semantic HTML first.
- Keyboard navigation: all interactive elements reachable via Tab. Visible focus indicators.
- Colour contrast: WCAG AA minimum 4.5:1 for text, 3:1 for large text. Test with browser devtools.
- Screen readers: test with NVDA (Windows), VoiceOver (Mac/iOS), TalkBack (Android).
- Skip links: "Skip to main content" link at top for keyboard users.
- Alt text: descriptive for informative images, empty alt="" for decorative.
- Form labels: every input needs a <label>. Error messages linked via aria-describedby.
- Reduced motion: prefers-reduced-motion media query. Respect user preferences.

**--- DEPLOYMENT ---**

- Vercel: git push to deploy. Preview per PR. Edge functions, serverless, static. Best for Next.js.
- Netlify: similar to Vercel. Good for static sites, Astro, SvelteKit.
- Cloudflare Pages: fast CDN, Workers for edge compute, R2 for storage, D1 for SQLite.
- Railway: Heroku replacement. Docker or Nixpacks. PostgreSQL, Redis included.
- Fly.io: deploy Docker containers close to users. Global distribution.
- Docker: containerise for self-hosting. Multi-stage builds for small images. Docker Compose for local dev.
- Reverse proxy: Nginx, Caddy (auto-HTTPS), Traefik. SSL termination, load balancing.
- DNS: A record for IP, CNAME for domain alias, TXT for verification. Cloudflare for CDN + DNS.
- SSL: Let's Encrypt free certificates. Auto-renew with Caddy or certbot.
- Environment variables: .env.local for dev, platform env vars for production. Never commit secrets.

**When helping with web development:**
- Detect the framework from package.json, file extensions, and project structure
- Use framework-specific patterns — don't write React patterns in a Vue project
- Performance and accessibility matter from day one, not as an afterthought
- Security at API boundaries — validate input, sanitise output, parameterise queries
- If unsure about an API, search the official docs using the URLs above
- Prefer the framework's built-in solution before reaching for a library`,
  },
  {
    id: 'mobile-development',
    name: 'Mobile Development',
    description: 'Cross-platform and native mobile — React Native, Flutter, Swift/SwiftUI, Kotlin, Capacitor, app store deployment.',
    domain: 'mobile-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'chat', 'brainstorm'],
    context: `You have deep expertise in mobile app development across all major platforms.

**Documentation URLs:**
- React Native: https://reactnative.dev/docs
- Expo: https://docs.expo.dev
- Flutter: https://docs.flutter.dev
- Dart: https://dart.dev/guides
- Swift/SwiftUI: https://developer.apple.com/documentation/swiftui
- UIKit: https://developer.apple.com/documentation/uikit
- Kotlin/Jetpack Compose: https://developer.android.com/develop/ui/compose
- Android: https://developer.android.com/docs
- Capacitor: https://capacitorjs.com/docs
- Tauri Mobile: https://v2.tauri.app/guides/
If unsure about an API, use web_search with these docs.

**Terminology:**
- Native: platform-specific code (Swift/Kotlin). Best performance, full API access. Two codebases.
- Cross-platform: single codebase, multiple platforms. React Native, Flutter, Capacitor.
- Hybrid: web app wrapped in native shell. Capacitor, Ionic. Web tech + native bridge.
- Bridge: communication layer between JS/Dart and native code. React Native bridge, Flutter platform channels.
- JSI: JavaScript Interface. React Native's new architecture replacing the bridge. Synchronous, faster.
- Fabric: React Native's new rendering system. Concurrent features, synchronous layout.
- Turbo Modules: lazy-loaded native modules in React Native new architecture.
- Widget: Flutter's building block. Everything is a widget. StatelessWidget, StatefulWidget.
- Hot reload: instant UI updates without losing state. Flutter and React Native both support it.
- Deep linking: open specific app screens from URLs. Universal Links (iOS), App Links (Android).
- Push notifications: APNs (iOS), FCM (Android). Expo Push, OneSignal, Firebase Cloud Messaging.
- App signing: code signing certificates for distribution. iOS provisioning profiles, Android keystore.
- OTA updates: over-the-air JS bundle updates without app store review. Expo Updates, CodePush.

**--- FRAMEWORK: REACT NATIVE ---**

Detection: package.json with "react-native", metro.config.js, app.json/app.config.js.

Project structure (Expo):
- app/: file-based routing (Expo Router)
- components/: reusable components
- hooks/: custom hooks
- constants/: theme, config
- assets/: images, fonts
- app.json or app.config.ts: app configuration

Build & run (use bash):
- Expo dev: \`npx expo start\` (starts Metro bundler + dev tools)
- iOS simulator: \`npx expo run:ios\` or press 'i' in Expo CLI
- Android emulator: \`npx expo run:android\` or press 'a' in Expo CLI
- Build for stores (Expo): \`eas build --platform ios\` / \`eas build --platform android\`
- Build locally: \`npx expo run:ios --configuration Release\` / \`npx expo run:android --variant release\`
- Submit to stores: \`eas submit --platform ios\` / \`eas submit --platform android\`
- OTA update: \`eas update --branch production\`
- Bare React Native: \`npx react-native run-ios\` / \`npx react-native run-android\`
- Metro bundler: \`npx react-native start --reset-cache\` (fix cache issues)

Core concepts:
- Components: View (div), Text (span/p), ScrollView, FlatList (virtualised list), Pressable/TouchableOpacity.
- StyleSheet: StyleSheet.create({}). Flexbox layout (column default, not row). No CSS — style objects.
- Navigation: React Navigation (stack, tabs, drawer) or Expo Router (file-based, Next.js-like).
- Platform-specific: Platform.OS === 'ios'/'android'. Platform.select({ ios: x, android: y }). .ios.tsx/.android.tsx files.
- Animations: Reanimated (performance, runs on UI thread), Moti (declarative), LayoutAnimation (simple).
- Gestures: react-native-gesture-handler. Pan, pinch, rotation, tap. Worklets for UI thread.
- Safe areas: SafeAreaView or useSafeAreaInsets(). Handle notches, status bars, home indicators.
- Lists: FlatList for long lists (virtualised). SectionList for grouped. Never use ScrollView with map() for long lists.
- Images: Image component, expo-image (faster, caching, blur hash), FastImage.
- Storage: AsyncStorage (simple key-value), expo-secure-store (encrypted), MMKV (fastest), SQLite (relational).
- Camera: expo-camera. Permissions, photo capture, barcode scanning.
- Location: expo-location. Foreground/background tracking, geofencing.
- Notifications: expo-notifications. Local + push. Scheduled, interactive, categories.
- Linking/deep links: expo-linking, expo-router deep links. Universal/app links.
- Native modules: expo-modules-api (Swift/Kotlin native code with TypeScript API), Turbo Modules.

New Architecture (React Native 0.76+):
- JSI replaces bridge — synchronous native calls from JS.
- Fabric renderer — concurrent rendering, synchronous layout.
- Turbo Modules — lazy-loaded native modules.
- Codegen — type-safe native interfaces from TypeScript specs.
- Enable: newArchEnabled in gradle.properties (Android) or RCT_NEW_ARCH_ENABLED in Podfile (iOS).

Performance:
- FlatList: keyExtractor, getItemLayout (skip measurement), windowSize, maxToRenderPerBatch.
- Memoisation: React.memo for list items, useMemo/useCallback for expensive computations.
- Hermes: JS engine optimised for React Native. Faster startup, lower memory. Default since RN 0.70.
- Image sizes: resize images to display size. Don't load 4K images for thumbnails.
- Bundle size: use Metro tree shaking, remove unused dependencies, analyse with react-native-bundle-visualizer.

**--- FRAMEWORK: FLUTTER ---**

Detection: pubspec.yaml, lib/main.dart, .dart files.

Project structure:
- lib/: Dart source code
- lib/main.dart: app entry point
- lib/screens/ or lib/pages/: screen widgets
- lib/widgets/: reusable widgets
- lib/models/: data models
- lib/services/: API, auth, storage services
- lib/providers/ or lib/blocs/: state management
- pubspec.yaml: dependencies + assets
- android/: Android-specific code
- ios/: iOS-specific code

Build & run (use bash):
- Dev: \`flutter run\` (debug on connected device/emulator)
- iOS: \`flutter run -d ios\` or \`flutter run -d 'iPhone 15'\`
- Android: \`flutter run -d android\`
- Build APK: \`flutter build apk --release\`
- Build AAB: \`flutter build appbundle --release\` (Play Store format)
- Build iOS: \`flutter build ios --release\` then archive in Xcode
- Build web: \`flutter build web\`
- Analyse: \`flutter analyze\` (lint), \`flutter test\` (unit tests)
- Clean: \`flutter clean && flutter pub get\` (fix dependency issues)
- Pub get: \`flutter pub get\` (install dependencies)

Core concepts:
- Everything is a Widget. StatelessWidget (immutable), StatefulWidget (has State, setState()).
- Material Design: MaterialApp, Scaffold, AppBar, FloatingActionButton, BottomNavigationBar.
- Cupertino: CupertinoApp, CupertinoNavigationBar. iOS-style widgets.
- Layout: Column (vertical), Row (horizontal), Stack (layered), Expanded, Flexible, SizedBox, Padding.
- ListView: ListView.builder() for long lists (lazy rendering). Never ListView(children: [...]) for dynamic data.
- Navigation: Navigator.push/pop (imperative), GoRouter (declarative, deep links, web URLs).
- State: setState() for local. Provider, Riverpod, Bloc, GetX for app-wide state.
- Riverpod: modern state management. Provider, StateNotifierProvider, FutureProvider, StreamProvider.
- Bloc pattern: Event → Bloc → State. Separation of business logic and UI. flutter_bloc package.
- Streams: Dart async. Stream.listen(), StreamBuilder widget, StreamController for custom streams.
- Future: async/await, FutureBuilder widget. Handle loading/error/data states.
- HTTP: http package (basic), dio (interceptors, cancel, upload), retrofit (code generation).
- JSON: json_serializable + build_runner for code-gen. fromJson/toJson. freezed for immutable models.
- Theming: ThemeData, ColorScheme, TextTheme. Theme.of(context) for access. Dark/light mode.
- Localisation: intl package, ARB files, gen-l10n for code generation.

Platform-specific:
- Platform channels: MethodChannel for calling Swift/Kotlin from Dart. EventChannel for streams.
- Platform views: embed native views (maps, webviews) in Flutter widget tree.
- Flavours: different configs per environment (dev/staging/prod). --flavor flag.
- Permissions: permission_handler package. Request at runtime, handle denied/permanent states.

Performance:
- const constructors: const Text('hello') prevents rebuilds. Use const everywhere possible.
- RepaintBoundary: isolate frequently repainting widgets.
- DevTools: Flutter DevTools for profiling, widget inspector, network, memory.
- Shader compilation: pre-warm shaders with SkSL to avoid first-frame jank. \`flutter run --profile --cache-sksl\`.
- Isolates: Dart's version of threads. compute() for heavy work. Don't block the main isolate.

**--- NATIVE: SWIFT / SWIFTUI (iOS) ---**

Detection: .xcodeproj, .xcworkspace, .swift files, Package.swift.

Docs: https://developer.apple.com/documentation/swiftui

Build & run (use bash):
- Build: \`xcodebuild -project MyApp.xcodeproj -scheme MyApp -configuration Release build\`
- Build workspace: \`xcodebuild -workspace MyApp.xcworkspace -scheme MyApp build\`
- Run tests: \`xcodebuild test -project MyApp.xcodeproj -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15'\`
- Archive: \`xcodebuild archive -scheme MyApp -archivePath MyApp.xcarchive\`
- Swift Package Manager: \`swift build\`, \`swift test\`, \`swift run\`
- CocoaPods: \`pod install\` (generates .xcworkspace)
- Clean: \`xcodebuild clean\` or delete DerivedData

Core SwiftUI:
- Views: struct MyView: View { var body: some View { } }. Declarative, value types.
- State: @State (local), @Binding (child), @ObservedObject/@StateObject (view model), @EnvironmentObject (app-wide).
- Observable: @Observable macro (iOS 17+). Automatic tracking, no @Published needed.
- Navigation: NavigationStack, NavigationLink, .navigationDestination(). Replaces NavigationView.
- Lists: List { ForEach(items) { } }. Lazy loading built in. Swipe actions, pull to refresh.
- Layout: VStack, HStack, ZStack, LazyVGrid, LazyHGrid, GeometryReader.
- Modifiers: .padding(), .background(), .foregroundStyle(), .font(), .frame(). Chain them.
- Animations: withAnimation { }, .animation(.spring, value:), .transition(), matchedGeometryEffect.
- Async: Task { await }, .task { } modifier, AsyncImage, async/await everywhere.
- Data persistence: SwiftData (@Model, @Query), UserDefaults, Keychain, Core Data (legacy).
- Networking: URLSession, async/await. Codable for JSON decoding.
- App lifecycle: @main App, WindowGroup, Scene. .onAppear, .onDisappear, .onChange.

**--- NATIVE: KOTLIN / JETPACK COMPOSE (Android) ---**

Detection: build.gradle.kts, .kt files, AndroidManifest.xml.

Docs: https://developer.android.com/develop/ui/compose

Build & run (use bash):
- Build debug: \`./gradlew assembleDebug\`
- Build release: \`./gradlew assembleRelease\`
- Build AAB: \`./gradlew bundleRelease\`
- Install: \`adb install app/build/outputs/apk/debug/app-debug.apk\`
- Run tests: \`./gradlew test\`
- Clean: \`./gradlew clean\`
- Lint: \`./gradlew lint\`

Core Jetpack Compose:
- Composables: @Composable fun MyScreen() { }. Functions, not classes.
- State: remember { mutableStateOf() }, rememberSaveable (survives config change), collectAsState() for flows.
- ViewModel: viewModel() for UI state. StateFlow/SharedFlow for reactive state.
- Navigation: NavHost, NavController, composable("route") { }. Type-safe nav in Compose.
- Layout: Column, Row, Box, LazyColumn (RecyclerView equivalent), LazyRow, Scaffold.
- Material 3: MaterialTheme, Surface, Card, TopAppBar, BottomNavigation, FloatingActionButton.
- Modifiers: Modifier.padding().fillMaxWidth().clickable { }. Order matters.
- Side effects: LaunchedEffect (coroutine in composition), DisposableEffect (cleanup), SideEffect.
- Theming: MaterialTheme { }, ColorScheme, Typography, Shapes. Dynamic colour (Material You).
- Coroutines: viewModelScope.launch { }, withContext(Dispatchers.IO) for background. Flow for streams.
- Room: @Entity, @Dao, @Database. SQL with compile-time verification. Flow for reactive queries.
- Retrofit: interface-based HTTP client. @GET, @POST, @Body, @Query. Moshi/Gson for JSON.
- Hilt: dependency injection. @HiltViewModel, @Inject, @Module, @Provides.
- DataStore: Preferences DataStore (key-value), Proto DataStore (typed). Replaces SharedPreferences.
- WorkManager: background tasks that survive process death. Constraints (network, battery, charging).

**--- CAPACITOR / HYBRID ---**

Detection: capacitor.config.ts/json, package.json with "@capacitor/core".

Docs: https://capacitorjs.com/docs

Core concepts:
- Web app wrapped in native shell. Write once (HTML/CSS/JS), deploy to iOS/Android/web.
- Plugins: @capacitor/camera, @capacitor/geolocation, @capacitor/push-notifications, @capacitor/filesystem.
- Native bridge: Capacitor.Plugins.Camera.getPhoto(). Async, promise-based.
- Build: \`npx cap sync\` (copy web assets + sync plugins), \`npx cap open ios\` / \`npx cap open android\`.
- Live reload: \`npx cap run ios --livereload --external\` for dev with hot reload on device.
- Custom plugins: create Swift/Kotlin code, expose via @CapacitorPlugin annotation.
- Web fallback: plugins gracefully degrade on web. Camera opens file picker, etc.
- Works with: React, Vue, Svelte, Angular, vanilla JS. Any web framework.
- Performance: web rendering, not native UI. Good enough for most apps. Heavy animation/graphics may lag.

**--- APP STORE DEPLOYMENT ---**

iOS App Store:
- Apple Developer account: $99/year. Required for distribution.
- Certificates: development + distribution. Generated in Xcode or Apple Developer portal.
- Provisioning profiles: link app ID + certificate + device list. Ad Hoc for testing, App Store for release.
- App Store Connect: create app listing, screenshots (6.7", 6.5", 5.5"), description, keywords, age rating.
- TestFlight: beta testing. Internal (100 testers, no review), External (10,000, needs review).
- Review guidelines: https://developer.apple.com/app-store/review/guidelines/. Common rejections: crashes, incomplete features, misleading metadata.
- Build upload: Xcode → Archive → Distribute → App Store Connect. Or \`xcrun altool\` CLI.

Google Play Store:
- Google Developer account: $25 one-time fee.
- Signing: upload key + app signing key. Google manages the signing key (App Signing by Google Play).
- AAB format: Android App Bundle. Google generates optimised APKs per device.
- Play Console: create app listing, screenshots, description, content rating questionnaire, privacy policy.
- Testing tracks: internal (100 testers), closed (managed lists), open (anyone), production.
- Review: typically 1-3 days. Policy centre for violations.
- Build upload: Play Console → Release → Production → Upload AAB.

**--- MOBILE PATTERNS ---**

- Offline-first: cache data locally, sync when online. Optimistic UI updates. Conflict resolution.
- Pull to refresh: standard pattern for list reload. RefreshControl (RN), RefreshIndicator (Flutter).
- Infinite scroll: paginated API + scroll listener. Load more when near bottom. Show loading indicator.
- Biometric auth: Face ID, Touch ID, fingerprint. expo-local-authentication, local_auth (Flutter).
- In-app purchases: StoreKit 2 (iOS), Google Play Billing. RevenueCat for cross-platform.
- App links / deep links: open specific screens from URLs. Handle in navigation layer.
- Background tasks: limited on mobile. iOS BGTaskScheduler, Android WorkManager. Battery restrictions.
- Permissions: request at point of use, not on launch. Explain why before requesting. Handle denial gracefully.
- Responsive: different layouts for phone/tablet. MediaQuery, breakpoints, adaptive widgets.
- Haptics: feedback on interactions. Haptics.impactAsync() (Expo), HapticFeedback (Flutter).

**When helping with mobile development:**
- Detect the framework from project files (app.json/metro = React Native, pubspec.yaml = Flutter, .xcodeproj = iOS, build.gradle = Android, capacitor.config = Capacitor)
- Use framework-specific patterns and APIs
- When asked to build/run — use bash with the correct CLI command. NEVER say you can't build a mobile app.
- Consider platform differences: iOS and Android have different UX conventions, permissions models, and capabilities
- Performance matters on mobile more than web — watch memory, battery, network usage
- If unsure about an API, search the official docs using the URLs above`,
  },
  {
    id: 'api-development',
    name: 'API Development',
    description: 'REST, GraphQL, gRPC, WebSocket APIs — design, auth, versioning, rate limiting, documentation, testing, OpenAPI.',
    domain: 'api-development',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `You have deep expertise in API design, development, and operations.

**Documentation URLs:**
- OpenAPI/Swagger: https://swagger.io/docs/specification
- GraphQL: https://graphql.org/learn
- gRPC: https://grpc.io/docs
- tRPC: https://trpc.io/docs
- REST best practices: https://restfulapi.net
- JSON:API: https://jsonapi.org
- OAuth 2.0: https://oauth.net/2
- JWT: https://jwt.io/introduction
- Postman: https://learning.postman.com/docs
- Hoppscotch: https://docs.hoppscotch.io
- FastAPI: https://fastapi.tiangolo.com
- Express: https://expressjs.com
- NestJS: https://docs.nestjs.com
- Spring Boot: https://docs.spring.io/spring-boot/docs/current/reference/html
If unsure about a spec or pattern, use web_search with these docs.

**Terminology:**
- Endpoint: URL path that accepts requests. /api/users, /api/orders/:id.
- Resource: the thing the API represents (user, order, product). Noun, not verb.
- CRUD: Create (POST), Read (GET), Update (PUT/PATCH), Delete (DELETE).
- Idempotent: same request multiple times = same result. GET, PUT, DELETE are idempotent. POST is not.
- Pagination: limit + offset, cursor-based (next_cursor), or keyset. Cursor is most scalable.
- Rate limiting: restrict requests per time window. 429 Too Many Requests. Headers: X-RateLimit-Limit, X-RateLimit-Remaining.
- Throttling: slow down requests instead of rejecting. Exponential backoff on client side.
- Webhook: server pushes events to your URL. Register callback, verify signature, handle retries.
- SDK: client library wrapping API calls. Auto-generated from OpenAPI spec.
- HATEOAS: Hypermedia As The Engine Of Application State. Links in responses for discoverability. REST maturity level 3.
- Idempotency key: client-generated unique key to prevent duplicate operations. Critical for payments.
- API gateway: single entry point. Routes, auth, rate limiting, caching, transformation. Kong, AWS API Gateway.

**--- REST API DESIGN ---**

URL structure:
- Nouns not verbs: /api/users not /api/getUsers.
- Plural resources: /api/users, /api/orders, /api/products.
- Nested resources: /api/users/:id/orders (orders belonging to user).
- Query params for filtering: /api/users?role=admin&status=active.
- Query params for pagination: /api/users?page=2&limit=20 or ?cursor=abc123.
- Query params for sorting: /api/users?sort=created_at&order=desc.
- Query params for fields: /api/users?fields=id,name,email (sparse fieldsets).

HTTP methods:
- GET: read resource(s). No body. Cacheable. Idempotent.
- POST: create resource. Body contains data. Returns 201 + Location header.
- PUT: full replace. Send entire resource. Idempotent. 200 or 204.
- PATCH: partial update. Send only changed fields. JSON Merge Patch or JSON Patch.
- DELETE: remove resource. Idempotent. 204 No Content.
- OPTIONS: CORS preflight. Returns allowed methods, headers.
- HEAD: like GET but no body. Check if resource exists, get headers.

Status codes:
- 200 OK: success with body. 201 Created: resource created. 204 No Content: success, no body.
- 301 Moved Permanently. 304 Not Modified (caching).
- 400 Bad Request: validation error. 401 Unauthorized: not authenticated. 403 Forbidden: not authorised.
- 404 Not Found. 409 Conflict: duplicate, version mismatch. 422 Unprocessable Entity: semantic validation.
- 429 Too Many Requests: rate limited. Include Retry-After header.
- 500 Internal Server Error. 502 Bad Gateway. 503 Service Unavailable. 504 Gateway Timeout.

Response format:
- Consistent envelope: { "data": ..., "meta": { "page": 1, "total": 100 } }.
- Error format: { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }.
- Include request_id in errors for debugging.
- Timestamps in ISO 8601: "2026-03-31T14:30:00Z". Always UTC.
- Money in smallest unit (cents/pence). Never float for currency.

Versioning:
- URL path: /api/v1/users, /api/v2/users. Simple, explicit.
- Header: Accept: application/vnd.myapi.v2+json. Cleaner URLs but harder to discover.
- Query param: /api/users?version=2. Easy but ugly.
- Strategy: v1 is stable, v2 is development. Deprecation notices. Sunset header.

**--- GRAPHQL ---**

Core concepts:
- Schema: type definitions. type User { id: ID!, name: String!, email: String! }.
- Query: read data. query { users { id name } }. Client specifies exact fields needed.
- Mutation: write data. mutation { createUser(input: { name: "..." }) { id } }.
- Subscription: real-time updates over WebSocket. subscription { orderUpdated { id status } }.
- Resolver: function that returns data for each field. Query → resolver → data source.
- Schema-first vs code-first: write .graphql schema file OR generate from code (TypeGraphQL, Nexus, Pothos).
- Fragments: reusable field selections. fragment UserFields on User { id name email }.
- Variables: parameterise queries. query GetUser($id: ID!) { user(id: $id) { name } }.
- Directives: @deprecated, @skip(if:), @include(if:). Custom directives for auth, caching.

Performance:
- N+1 problem: resolver per field hits DB per item. Fix with DataLoader (batching + caching).
- Query depth limiting: prevent { user { friends { friends { friends } } } } attacks. Max depth 5-10.
- Query complexity: assign cost per field. Reject queries over budget.
- Persisted queries: hash queries at build time. Send hash not full query. Smaller payloads + security.

Tools:
- Apollo Server/Client: full-featured GraphQL stack. Caching, subscriptions, federation.
- Hasura: auto-generate GraphQL from PostgreSQL. Real-time subscriptions. Auth via webhooks/JWT.
- Prisma + Pothos/Nexus: type-safe schema from database models.
- GraphQL Playground / Apollo Studio: interactive query editor, schema explorer.

**--- gRPC ---**

Core concepts:
- Protocol Buffers (protobuf): binary serialisation. .proto files define messages and services.
- Service definition: service UserService { rpc GetUser(GetUserRequest) returns (User); }.
- Message: message User { string id = 1; string name = 2; string email = 3; }.
- Code generation: protoc compiler generates client/server stubs in any language.
- HTTP/2: multiplexed, bidirectional streaming, header compression. Faster than REST.
- Streaming: unary (request-response), server streaming, client streaming, bidirectional streaming.

When to use:
- Microservice-to-microservice communication (internal, high performance).
- NOT for public-facing APIs (browsers can't call gRPC directly — use gRPC-Web or REST gateway).
- When schema enforcement + code generation saves development time.
- When streaming is needed (real-time data feeds, chat, monitoring).

Tools:
- grpcurl: CLI for testing gRPC services. Like curl for gRPC.
- gRPC-Gateway: auto-generate REST API from gRPC service definition.
- Buf: modern protobuf tooling. Linting, breaking change detection, registry.
- Connect: gRPC-compatible protocol that works in browsers. Buf's lighter alternative.

**--- WebSocket APIs ---**

Core concepts:
- Full-duplex: both client and server can send messages anytime. Persistent connection.
- Handshake: HTTP upgrade request. 101 Switching Protocols.
- Events: open, message, close, error. Binary or text frames.
- Use cases: chat, live notifications, real-time dashboards, collaborative editing, gaming.

Patterns:
- Heartbeat / ping-pong: detect dead connections. Send ping every 30s, expect pong.
- Reconnection: client auto-reconnect with exponential backoff. Restore state on reconnect.
- Rooms / channels: group connections by topic. Subscribe/unsubscribe. Broadcast to room.
- Message format: JSON with { type: "event_name", data: { ... } }. Or protobuf for binary.
- Scaling: WebSockets are stateful. Need sticky sessions or pub/sub (Redis) for multi-server.

Libraries:
- ws (Node.js): lightweight, fast. Manual room/broadcast logic.
- Socket.IO: auto-reconnect, rooms, namespaces, fallback to long-polling. Heavier.
- Hono WSS: built into Hono framework. Lightweight.
- Ably / Pusher: managed real-time messaging. SDKs for all platforms.

**--- tRPC ---**

Core concepts:
- End-to-end type safety: TypeScript types shared between client and server. No codegen.
- Procedures: query (read), mutation (write), subscription (real-time).
- Router: group procedures. appRouter = router({ user: userRouter, post: postRouter }).
- Context: request metadata (user session, DB connection). Created per request.
- Middleware: auth checks, logging, rate limiting. Compose with .use().
- Client: createTRPCClient. Auto-completes procedure names and input types.
- React Query integration: @trpc/react-query. useQuery, useMutation with full type inference.
- No REST routes needed. No API documentation to maintain. Types ARE the contract.

When to use:
- Full-stack TypeScript apps (Next.js, Remix, SvelteKit).
- Internal APIs where client and server share a repo.
- NOT for public APIs consumed by third parties (use REST/GraphQL with OpenAPI).

**--- AUTHENTICATION & AUTHORISATION ---**

API key auth:
- Simple: X-API-Key header or ?api_key= query param.
- Generate: random 32+ byte string. Hash before storing. Prefix for identification (sk-live-...).
- Rotate: support multiple active keys. Deprecate old keys with grace period.
- Scope: read-only, read-write, admin. Per-resource permissions if needed.

OAuth 2.0 flows:
- Authorization Code + PKCE: web/mobile apps. Redirect → consent → code → token exchange.
- Client Credentials: machine-to-machine. No user involved. Service accounts.
- Device Code: smart TVs, CLI tools. Display code, user authorises on another device.
- Refresh tokens: short-lived access tokens (15min-1hr) + long-lived refresh tokens. Rotate on use.

JWT:
- Structure: header.payload.signature (base64url encoded).
- Claims: sub (subject), iat (issued at), exp (expiry), iss (issuer), aud (audience). Custom claims for roles/permissions.
- Verification: check signature, check exp, check iss/aud. Use a library — never parse manually.
- Storage: httpOnly cookie (web, CSRF protection needed) or Authorization: Bearer header (mobile/SPA).
- Revocation: JWTs are stateless — can't revoke. Use short expiry + refresh tokens, or maintain a deny list.

RBAC / ABAC:
- RBAC: role-based. User → roles → permissions. Check permission not role in code.
- ABAC: attribute-based. Policies evaluate attributes (user.department, resource.owner, time).
- Row-level security: database enforces access per row. Supabase RLS, PostgreSQL policies.

**--- API SECURITY ---**

- Input validation: validate ALL input at API boundary. Type, length, format, range. Zod, Joi, JSON Schema.
- SQL injection: parameterised queries. NEVER concatenate user input into SQL.
- Mass assignment: whitelist allowed fields. Don't pass req.body directly to database.
- Rate limiting: per IP, per API key, per user, per endpoint. Different limits for auth endpoints.
- CORS: whitelist specific origins. Never Access-Control-Allow-Origin: * with credentials.
- HTTPS only: HSTS header. Reject HTTP. TLS 1.2+.
- Request signing: HMAC signature for webhooks. Verify signature before processing.
- Content-Type validation: reject unexpected content types. application/json only if that's all you accept.
- Response headers: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, CSP.
- Logging: log request method, path, status, duration, user_id. Don't log request bodies with PII.
- Error messages: don't leak stack traces, SQL errors, or internal paths in production.

**--- API DOCUMENTATION ---**

OpenAPI / Swagger:
- Spec file: openapi.yaml or openapi.json. Describes endpoints, schemas, auth, examples.
- Swagger UI: interactive documentation from OpenAPI spec. Try-it-out.
- Code generation: openapi-generator for client SDKs in any language.
- Validation: spectral lint rules. Catch inconsistencies, missing descriptions.

Best practices:
- Every endpoint documented with: summary, description, parameters, request body, responses, examples.
- Schema definitions for all request/response bodies. $ref for reuse.
- Auth schemes documented: which endpoints need auth, which scopes.
- Error responses documented: all possible error codes with examples.
- Changelog: version history with breaking changes highlighted.

**--- API TESTING ---**

- Unit tests: test individual handler/resolver logic. Mock dependencies.
- Integration tests: test full request→response cycle. Real database (test container or in-memory).
- Contract tests: verify API matches OpenAPI spec. Pact for consumer-driven contracts.
- Load tests: k6, Artillery, Locust. Measure throughput, latency, error rate under load.
- Postman / Hoppscotch: manual exploration + automated collection runs. Environment variables.
- Snapshot tests: record API responses, compare against saved snapshots. Catch unintended changes.
- Fuzz testing: send random/malformed input. Find crashes, validation gaps.

Commands (use bash):
- k6: \`k6 run loadtest.js\`
- curl: \`curl -X POST http://localhost:3000/api/users -H 'Content-Type: application/json' -d '{"name":"test"}'\`
- httpie: \`http POST localhost:3000/api/users name=test\`
- Newman (Postman CLI): \`newman run collection.json -e environment.json\`

**--- API PATTERNS ---**

- Pagination: cursor-based for real-time data, offset for simple UIs. Return next_cursor, has_more.
- Filtering: ?status=active&role=admin. Support operators: ?price[gte]=10&price[lte]=100.
- Sorting: ?sort=-created_at,name (- prefix for descending).
- Search: ?q=search+term. Full-text search via PostgreSQL ts_vector or Elasticsearch.
- Bulk operations: POST /api/users/bulk with array body. Return partial success/failure per item.
- Long-running: return 202 Accepted + Location header for status polling. Or WebSocket for progress.
- Caching: ETag, Last-Modified, Cache-Control headers. 304 Not Modified. CDN caching for public data.
- Retry logic: client-side exponential backoff with jitter. Idempotency keys for POST.
- Circuit breaker: stop calling failing downstream services. Open → half-open → closed.
- Health check: GET /health returns { status: "ok", db: "connected", cache: "connected" }. For load balancers.
- Deprecation: Sunset header with date. Deprecation notice in response. Migration guide in docs.

**When helping with API development:**
- Design resources and endpoints before writing code
- Use consistent naming, status codes, and error formats across all endpoints
- Security at every boundary — validate input, authenticate, authorise, rate limit
- When asked to create an API — write the code, don't just describe the endpoints
- Document as you build — OpenAPI spec alongside implementation
- If unsure about a spec or pattern, search the official docs using the URLs above`,
  },
  {
    id: 'systems-programming',
    name: 'Systems Programming',
    description: 'Rust, C/C++, Go, Zig — memory management, concurrency, OS internals, networking, performance, embedded, compilers.',
    domain: 'systems-programming',
    version: '1.0.0',
    builtIn: true,
    modes: ['code', 'plan', 'security'],
    context: `You have deep expertise in systems programming, low-level development, and performance-critical software.

**Documentation URLs:**
- Rust: https://doc.rust-lang.org/book
- Rust std: https://doc.rust-lang.org/std
- Cargo: https://doc.rust-lang.org/cargo
- C++ Reference: https://en.cppreference.com
- Go: https://go.dev/doc
- Go std: https://pkg.go.dev/std
- Zig: https://ziglang.org/documentation
- Linux man pages: https://man7.org/linux/man-pages
- POSIX: https://pubs.opengroup.org/onlinepubs/9699919799
If unsure about an API or syscall, use web_search with these docs.

**Terminology:**
- Stack vs heap: stack = fast, automatic, limited size, LIFO. Heap = dynamic, manual/GC managed, slower allocation.
- RAII: Resource Acquisition Is Initialization. Acquire in constructor, release in destructor. C++ and Rust pattern.
- Ownership: Rust's core concept. Each value has one owner. When owner goes out of scope, value is dropped.
- Borrowing: Rust's &T (shared/immutable) and &mut T (exclusive/mutable). Enforced at compile time.
- Lifetime: Rust's 'a annotations. Compiler tracks how long references are valid. Prevents dangling pointers.
- Zero-cost abstractions: high-level code compiles to the same assembly as hand-written low-level code.
- UB: undefined behaviour. C/C++ trap. Compiler assumes it never happens. Can cause anything. Rust prevents most UB.
- ABI: Application Binary Interface. How compiled code calls other compiled code. C ABI is the lingua franca.
- FFI: Foreign Function Interface. Call C from Rust/Go/Zig. extern "C" fn, cgo, @cImport.
- Syscall: direct call to OS kernel. open, read, write, mmap, ioctl, epoll, kqueue.
- Endianness: byte order. Little-endian (x86, ARM), big-endian (network byte order). Convert with htonl/ntohl.
- Cache line: 64 bytes on most CPUs. Align data for cache efficiency. False sharing = different cores fighting over same cache line.
- SIMD: Single Instruction Multiple Data. Process 4/8/16 values in one instruction. SSE, AVX, NEON.
- Atomic: lock-free thread-safe operations. AtomicBool, AtomicUsize. Memory ordering: Relaxed, Acquire, Release, SeqCst.
- Futex: fast userspace mutex. Syscall only on contention. Basis of most mutex implementations.

**--- LANGUAGE: RUST ---**

Detection: Cargo.toml, .rs files.

Project structure:
- Cargo.toml: dependencies, features, build config
- src/main.rs: binary entry point
- src/lib.rs: library root
- src/bin/: multiple binaries
- tests/: integration tests
- benches/: benchmarks (criterion)
- build.rs: build script (code generation, linking)

Build & run (use bash):
- Build: \`cargo build\` (debug), \`cargo build --release\` (optimised)
- Run: \`cargo run\` or \`cargo run --release\`
- Test: \`cargo test\`, \`cargo test test_name\`, \`cargo test -- --nocapture\` (show println)
- Bench: \`cargo bench\`
- Check: \`cargo check\` (fast type-check without codegen)
- Clippy: \`cargo clippy\` (linter, catches common mistakes)
- Format: \`cargo fmt\`
- Doc: \`cargo doc --open\`
- Add dep: \`cargo add serde tokio axum\`
- Cross compile: \`cargo build --target x86_64-unknown-linux-musl\`

Core concepts:
- Ownership: each value has one owner. Move semantics by default. Clone for explicit copy.
- Borrowing: &T (shared, many readers), &mut T (exclusive, one writer). Can't have both simultaneously.
- Lifetimes: fn longest<'a>(x: &'a str, y: &'a str) -> &'a str. Compiler infers most.
- Enums: enum Option<T> { Some(T), None }. Pattern matching with match. No null.
- Result<T, E>: Ok(value) or Err(error). ? operator for propagation. No exceptions.
- Traits: like interfaces. impl Display for MyType. Generics: fn process<T: Display>(item: T).
- Closures: |x| x + 1. Fn (borrow), FnMut (mutable borrow), FnOnce (take ownership).
- Iterators: .iter(), .map(), .filter(), .collect(). Lazy, zero-cost. Chaining is idiomatic.
- Smart pointers: Box<T> (heap), Rc<T> (reference counted), Arc<T> (atomic ref count, thread-safe).
- Interior mutability: Cell<T>, RefCell<T> (runtime borrow checking), Mutex<T>, RwLock<T>.
- Unsafe: raw pointers, FFI, unsafe trait impls. Minimise. Encapsulate in safe abstractions.
- Macros: macro_rules! for declarative, proc macros for derive/attribute/function-like.

Async:
- async fn and .await. Future trait. Lazy — nothing happens until polled.
- Tokio: runtime, spawn, mpsc channels, timers, IO. #[tokio::main] on main.
- Async traits: use async-trait crate or native async fn in trait (Rust 1.75+).
- Select: tokio::select! for racing futures. First to complete wins.
- Channels: mpsc (multi-producer single-consumer), broadcast, watch, oneshot.
- Streams: async iterators. StreamExt for map, filter, next.

Web frameworks:
- Axum: tower-based, extractors, type-safe routing. Recommended for new projects.
- Actix-web: actor model, fast. More established, larger ecosystem.
- Warp: filter-based composition. Lightweight.
- Rocket: macro-heavy, ergonomic. Slower compile times.

Error handling:
- thiserror: derive Error for custom error types. #[error("message {field}")].
- anyhow: flexible error type for applications. anyhow::Result, .context("doing X").
- Pattern: thiserror for libraries (typed errors), anyhow for applications (any error).

Serialisation:
- serde: Serialize, Deserialize derive macros. Works with JSON, TOML, YAML, MessagePack, bincode.
- serde_json: to_string(), from_str(), Value for dynamic JSON.

CLI tools:
- clap: argument parsing. Derive API: #[derive(Parser)]. Subcommands, flags, env vars.
- Build release: cargo build --release. Strip: strip target/release/mybinary. ~1-5MB.

**--- LANGUAGE: C / C++ ---**

Detection: .c/.h (C), .cpp/.hpp/.cc/.hh (C++), CMakeLists.txt, Makefile, .vcxproj.

Build (use bash):
- GCC: \`gcc -o output main.c -Wall -Wextra -O2\` (C), \`g++ -o output main.cpp -std=c++20 -Wall -O2\` (C++)
- Clang: \`clang -o output main.c\`, \`clang++ -o output main.cpp -std=c++20\`
- CMake: \`cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build\`
- Make: \`make\`, \`make clean\`, \`make install\`
- Debug: \`gcc -g -O0 main.c\` then \`gdb ./output\` or \`lldb ./output\`
- Sanitisers: \`-fsanitize=address\` (memory), \`-fsanitize=undefined\` (UB), \`-fsanitize=thread\` (races)
- Valgrind: \`valgrind --leak-check=full ./output\`

Modern C++ (C++17/20/23):
- Smart pointers: std::unique_ptr (owning), std::shared_ptr (ref counted), std::weak_ptr (non-owning). No raw new/delete.
- Containers: std::vector, std::unordered_map, std::string, std::string_view, std::array, std::span.
- Algorithms: std::sort, std::find, std::transform, std::accumulate, ranges (C++20).
- Optionals: std::optional<T>. Has value or empty. .value(), .has_value(), .value_or(default).
- Variants: std::variant<int, string>. Type-safe union. std::visit for pattern matching.
- Structured bindings: auto [x, y] = std::make_pair(1, 2). auto& [key, value] : map.
- Concepts (C++20): template<Sortable T> void sort(T&). Constrain templates. Clear error messages.
- Coroutines (C++20): co_await, co_yield, co_return. Generator pattern. Task<T>.
- Modules (C++20): import std; Replace headers. Faster compilation. export module mymodule.
- Ranges (C++20): views::filter, views::transform. Lazy, composable. Pipe syntax |.
- std::format (C++20): type-safe formatting. std::format("{} is {}", name, age).
- constexpr: compile-time computation. constexpr functions, if constexpr.

Memory management:
- RAII: acquire in constructor, release in destructor. Stack unwinding handles cleanup.
- Rule of 5: if you define destructor, define copy constructor, copy assignment, move constructor, move assignment. Or = delete.
- Move semantics: std::move() transfers ownership. Avoid copies for large objects.
- Memory layout: struct padding/alignment. alignas, #pragma pack. Cache-friendly data layout.
- Allocators: custom allocators for pools, arenas, stack allocators. Reduce malloc overhead.

C patterns:
- Error handling: return codes. 0 = success, negative = error. errno for details.
- Strings: null-terminated char arrays. strlen, strcpy, strncpy, snprintf. Buffer overflow risk — use bounds.
- Memory: malloc/calloc/realloc/free. Always check for NULL. Always free. Use valgrind.
- File IO: fopen, fread, fwrite, fclose. Or POSIX open, read, write, close for low-level.
- Structs: typedef struct { int x; int y; } Point. Opaque pointers for encapsulation.

**--- LANGUAGE: GO ---**

Detection: go.mod, .go files.

Build & run (use bash):
- Run: \`go run main.go\` or \`go run .\`
- Build: \`go build -o output .\`
- Test: \`go test ./...\`, \`go test -v -run TestName\`
- Bench: \`go test -bench=. -benchmem\`
- Vet: \`go vet ./...\` (static analysis)
- Format: \`gofmt -w .\` or \`goimports -w .\`
- Mod: \`go mod init module\`, \`go mod tidy\`, \`go get package@version\`
- Cross compile: \`GOOS=linux GOARCH=amd64 go build -o output .\`
- Static binary: \`CGO_ENABLED=0 go build -ldflags="-s -w" -o output .\`

Core concepts:
- Goroutines: go func() { ... }(). Lightweight threads. Millions concurrently. Not OS threads.
- Channels: ch := make(chan int). ch <- value (send), value := <-ch (receive). Synchronisation primitive.
- Select: select { case v := <-ch1: ... case ch2 <- v: ... default: ... }. Multiplex channels.
- Interfaces: implicit satisfaction. type Reader interface { Read(p []byte) (n int, err error) }. Duck typing.
- Error handling: if err != nil { return err }. errors.New(), fmt.Errorf("%w", err) for wrapping.
- Defer: defer file.Close(). Runs when function returns. LIFO order.
- Slices: dynamic arrays. make([]int, len, cap). append(), copy(). Slice of slice shares backing array.
- Maps: map[string]int. make(map[K]V). delete(m, key). v, ok := m[key] for existence check.
- Structs: type User struct { Name string; Age int }. Methods: func (u User) String() string.
- Pointers: &value (address), *ptr (dereference). No pointer arithmetic. Nil pointer = panic.
- Embedding: struct composition. type Admin struct { User; Level int }. Method promotion.
- Generics (Go 1.18+): func Map[T, U any](s []T, f func(T) U) []U. Type constraints.

Concurrency patterns:
- Worker pool: N goroutines consuming from a channel. Limit parallelism.
- Fan-out/fan-in: distribute work to multiple goroutines, collect results.
- Context: context.Context for cancellation, deadlines, values. Pass as first param.
- sync.WaitGroup: wg.Add(n), wg.Done(), wg.Wait(). Wait for N goroutines.
- sync.Mutex: mu.Lock(), mu.Unlock(). Protect shared state. defer mu.Unlock().
- sync.Once: once.Do(func() { ... }). Initialise exactly once. Thread-safe.
- errgroup: golang.org/x/sync/errgroup. Run goroutines, collect first error, cancel others.

Web:
- net/http: stdlib HTTP server/client. http.HandleFunc, http.ListenAndServe.
- Chi: lightweight router. Middleware, URL params, groups.
- Gin: fast HTTP framework. Middleware, JSON binding, validation.
- Echo: similar to Gin. Middleware, templating, WebSocket.

**--- LANGUAGE: ZIG ---**

Detection: build.zig, .zig files.

Build & run (use bash):
- Build: \`zig build\`
- Run: \`zig build run\`
- Test: \`zig build test\`
- Compile single file: \`zig build-exe main.zig\`
- Cross compile: \`zig build-exe -target x86_64-linux main.zig\`
- C interop: \`zig cc main.c -o output\` (drop-in C/C++ compiler with better defaults)
- Format: \`zig fmt src/\`

Core concepts:
- Comptime: compile-time execution. comptime var, comptime fn params. Generics via comptime.
- Optionals: ?T. if (optional) |value| { } else { }. orelse for default.
- Errors: error union T!E. try for propagation. catch for handling. errdefer for cleanup on error.
- Slices: []T. Pointer + length. No hidden capacity. []const u8 for strings.
- Allocators: explicit memory allocation. std.heap.page_allocator, GeneralPurposeAllocator, ArenaAllocator.
- No hidden control flow: no exceptions, no hidden allocations, no operator overloading. What you read is what runs.
- C interop: @cImport, @cInclude. Use any C library directly. Zig is also a C/C++ compiler.
- Build system: build.zig is code. No separate build tool. Dependencies via zig fetch.
- Testing: test "name" { ... } blocks in source files. try std.testing.expect(condition).

When to use:
- Replacing C in systems code (OS, drivers, embedded).
- C library interop without the friction.
- When you want low-level control without C/C++ footguns.
- Cross-compilation (Zig cross-compiles to 40+ targets out of the box).

**--- CONCURRENCY & PARALLELISM ---**

Models:
- Threads: OS-managed. Shared memory. Mutex/RwLock for synchronisation. Expensive to create (MB stack each).
- Green threads / goroutines / tasks: runtime-managed. Cheap (KB stack). M:N scheduling.
- Async/await: cooperative multitasking. Single thread, event loop. IO-bound workloads.
- Actor model: isolated actors communicate via messages. No shared state. Erlang, Akka, Actix.
- CSP: Communicating Sequential Processes. Goroutines + channels. Share memory by communicating.

Synchronisation:
- Mutex: mutual exclusion. One thread at a time. Deadlock risk with multiple mutexes.
- RwLock: multiple readers OR one writer. Better throughput for read-heavy workloads.
- Semaphore: limit concurrent access to N. Connection pools, rate limiting.
- Condition variable: wait for a condition. notify_one/notify_all. Used with mutex.
- Atomic operations: lock-free. Compare-and-swap (CAS). Wait-free progress guarantee.
- Lock-free data structures: concurrent queues, stacks, hash maps. Complex but scalable.

Pitfalls:
- Deadlock: A locks X, waits for Y. B locks Y, waits for X. Fix: consistent lock ordering.
- Race condition: outcome depends on thread timing. Fix: proper synchronisation or atomics.
- Priority inversion: low-priority thread holds lock needed by high-priority. Fix: priority inheritance.
- Starvation: thread never gets CPU time. Fix: fair scheduling, bounded waiting.
- False sharing: different cores modify nearby memory. Fix: pad to cache line boundaries.

**--- MEMORY & PERFORMANCE ---**

Memory layout:
- Cache hierarchy: L1 (1-2 cycles, 32-64KB), L2 (4-10 cycles, 256KB-1MB), L3 (20-40 cycles, 4-32MB), RAM (100+ cycles).
- Data-oriented design: arrays of structs (AoS) vs struct of arrays (SoA). SoA is cache-friendlier for iteration.
- Alignment: types naturally aligned (4-byte int on 4-byte boundary). Misaligned access is slow or crashes (ARM).
- Memory arenas: allocate large block, bump-allocate within it. Free all at once. Fast, no fragmentation.
- Memory-mapped files: mmap. Map file to virtual memory. OS handles paging. Good for large read-only data.

Profiling:
- CPU: perf (Linux), Instruments (macOS), VTune (Intel). Flame graphs for visualisation.
- Memory: valgrind massif, heaptrack, Instruments Allocations.
- Benchmarking: criterion (Rust), google benchmark (C++), testing.B (Go). Warm up, multiple iterations, statistical analysis.
- Compiler Explorer: godbolt.org. See assembly output. Compare optimisation levels.

Optimisation principles:
- Measure first. Profile before optimising. Don't guess where the bottleneck is.
- Algorithm > micro-optimisation. O(n log n) beats O(n²) at any constant factor.
- Data locality: keep related data together in memory. Iterate sequentially.
- Reduce allocations: pool, arena, stack allocate. Measure allocations per request.
- Branchless: avoid unpredictable branches in hot loops. Conditional moves, SIMD.
- Inlining: small functions inline automatically. #[inline] or __attribute__((always_inline)) for critical paths.

**--- NETWORKING ---**

Sockets:
- TCP: reliable, ordered, connection-oriented. socket → bind → listen → accept → read/write → close.
- UDP: unreliable, unordered, connectionless. socket → bind → recvfrom/sendto. Low latency.
- Unix domain sockets: local IPC. Faster than TCP localhost. File-based or abstract namespace.
- epoll (Linux) / kqueue (BSD/macOS) / io_uring (Linux 5.1+): async IO multiplexing. Handle thousands of connections.
- io_uring: async syscall interface. Submit queue + completion queue. Fastest Linux IO.

Protocols:
- HTTP/1.1: text-based, one request per connection (or keep-alive). Head-of-line blocking.
- HTTP/2: binary, multiplexed streams, header compression (HPACK), server push.
- HTTP/3: QUIC (UDP-based), no TCP head-of-line blocking, faster handshake, connection migration.
- TLS: handshake (key exchange, certificate verification), symmetric encryption. TLS 1.3 = 1-RTT.
- DNS resolution: getaddrinfo() or async resolvers. Cache results. TTL.

Serialisation:
- JSON: human-readable, universal. Slow to parse, large on wire.
- Protocol Buffers: binary, schema-defined, fast, compact. Code generation.
- MessagePack: binary JSON. Faster and smaller than JSON. No schema.
- FlatBuffers: zero-copy deserialisation. Access fields without unpacking. Game engines.
- Cap'n Proto: zero-copy RPC. Schema-based. Even faster than protobuf for IPC.

**--- EMBEDDED & OS ---**

Embedded:
- Bare metal: no OS. Direct hardware access. Startup code, linker scripts, interrupt handlers.
- RTOS: FreeRTOS, Zephyr, RIOT. Task scheduling, timing guarantees, minimal footprint.
- HAL: Hardware Abstraction Layer. Portable code across MCU families.
- Registers: memory-mapped IO. Read/write hardware registers. Volatile access.
- Interrupts: ISR (Interrupt Service Routine). Keep short. Defer work to main loop or task.
- DMA: Direct Memory Access. Transfer data without CPU. ADC, UART, SPI bulk transfers.
- Targets: ARM Cortex-M (STM32, nRF), ESP32, RP2040, RISC-V.
- Rust embedded: #![no_std], cortex-m-rt, embedded-hal traits, probe-rs for flashing/debugging.

OS concepts:
- Processes: isolated execution units. Fork, exec, wait. Virtual memory per process.
- Threads: shared memory within process. pthread_create, pthread_join.
- Virtual memory: page tables, TLB, demand paging, copy-on-write, mmap.
- File descriptors: int handles to open files/sockets/pipes. 0=stdin, 1=stdout, 2=stderr.
- Signals: SIGINT (Ctrl+C), SIGTERM (graceful stop), SIGKILL (force), SIGUSR1/2 (custom).
- IPC: pipes, named pipes (FIFOs), shared memory, message queues, Unix sockets.
- systemd: service management on Linux. Unit files, journalctl for logs, restart policies.

**When helping with systems programming:**
- Detect the language from project files (Cargo.toml = Rust, go.mod = Go, CMakeLists.txt/Makefile = C/C++, build.zig = Zig)
- Use language-specific idioms — Rust ownership, Go goroutines, C++ RAII, Zig comptime
- Memory safety matters — use safe abstractions, minimise unsafe code, run sanitisers
- When asked to build/compile — use bash with the correct build command. Don't say you can't.
- Performance: measure before optimising. Profile, don't guess.
- If unsure about an API or syscall, search the official docs using the URLs above`,
  },
];

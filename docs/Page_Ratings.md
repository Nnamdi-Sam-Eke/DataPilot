Page Ratings and Implementation Notes
===================================

Summary of per-page ratings, notes, and recommended fixes for implementation.

PageAuth — 9.2/10
- Notes: Split-panel design is stunning. Animated grid bg, staggered pill animations, stat badges, password toggle, reset flow, theme toggle.
- Issues / TODOs:
  - Add Google/OAuth option in auth flows.
  - Left panel is hidden on mobile; add a slim header with the dp logo for mobile.

PageOnboarding — 8.8/10
- Notes: Clean 5-step workflow, colour-coded step cards, atmosphere grid, skip/start CTAs.
- TODO: Add animated progression on hover for step cards.

PageBetaProfile — 8.5/10
- Notes: Option cards with active state glow.
- TODO: Add a progress bar across the two-page beta flow.

PageDashboard — 8.7/10
- Notes: Real-time Firestore listeners, sparklines, project expiry colouring, modal flows.
- TODOs:
  - Replace hardcoded `Models Trained` and `Avg. Accuracy` with derived values from `MODEL_STORE/trainedModels`.
  - Ensure consistency for responsive CSS (already good here).

PageUpload — 8.4/10
- Notes: Drag-and-drop, multi-file support, animated progress, expiry countdown, duplicate detection.
- TODOs:
  - Add explicit mobile grid breakpoint in the component (avoid relying on parent CSS).
  - Ensure preview table has responsive overflow handling.

PageOverview — 8.6/10
- Notes: Backend correlation matrix, SparkBar column cards, heatColor, metadata table.
- TODO: Add horizontal scroll wrapper for the correlation heatmap on small screens.

PageCleaning — 8.9/10
- Notes: 20+ operations, undo log, shimmer promote button.
- TODOs:
  - Make operation panel collapsible on mobile (grouped sections or accordions).
  - Add sticky action bar for mobile.

PageInsights — 8.5/10
- Notes: Chat interface with suggestion chips, rich text parsing, HTML report download.
- TODOs:
  - Add streaming response support for gradual AI responses.
  - Add message timestamps.

PageVisualization — 8.3/10
- Notes: 17 chart types, compare mode, color picker, lightbox expand.
- TODOs:
  - Add overflow-x wrapper to chart-type tab row for small screens.
  - Add error handling for canvas batch downloads.

PageTrain — 8.7/10
- Notes: Model comparison, feature importance, ProGate restrictions, TTL, download button.
- TODO: Smarten NextStepBar label for regression tasks (route/label divergence).

PagePredictions — 8.1/10
- Notes: Dual-mode inputs, multi-model switcher, CSV download.
- TODO: Add probability distribution chart for classification results.

PageReport — 8.4/10
- Notes: SVG heatmap builder, AI narrative toggle, full HTML report download.
- TODOs:
  - Avoid rebuilding heatmap logic in JSX; reuse backend or centralize the logic.
  - Replace inconsistent navigation usage (`useNavigate` vs `setPage`) with app pattern.

PageCodeGen — 8.6/10
- Notes: Three-format export, copy confirmations, full ML pipeline code generation.
- TODO: Include chart output cells (images) for Jupyter .ipynb export.

PageSettings — 7.9/10
- Notes: Profile edit, Groq key UI, theme swatches, plan badge.
- TODOs:
  - Either wire the Groq key UI to backend env flows or hide the UI if it cannot function client-side.

Mobile & Desktop Responsiveness
- Desktop: Solid across pages; sidebar + topbar shell works well.
- Mobile issues to address (high priority):
  - PageAuth: add slim header logo for mobile.
  - PageUpload: add mobile override for grid-template-columns and responsive preview table.
  - PageCleaning: collapsible/categorised operation panel; sticky actions.
  - PageVisualization: overflow-x wrapper for chart tabs.
  - PageOverview: scroll wrapper for correlation heatmap.
  - Topbar: ensure avatar dropdown / sign-out is accessible on mobile (≤768px).

Implementation notes
- I inserted per-page TODO comment blocks into the top of each page component file to make these items visible to engineers.
- Next steps: implement UI fixes iteratively, run the app and test mobile responsive flows, prioritize Dashboard, Cleaning, Auth mobile fixes.

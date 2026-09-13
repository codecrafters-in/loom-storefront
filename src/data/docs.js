/**
 * The documentation index.
 *
 * Here rather than in the page that renders it because three things need the
 * same list: the viewer, the prerenderer, and the sitemap. A build script
 * cannot import a `.jsx` file that uses `import.meta.glob`, and a second copy
 * of the list in `scripts/` is a copy that silently stops matching the folder.
 *
 * `readme` is the index of the section and lives at `/docs`. Everything else
 * is `/docs/<slug>`. One URL per document.
 */
export const docPages = [
  { slug: 'readme', file: 'README.md', title: 'Overview', group: 'Start' },
  { slug: 'user-guide', file: 'USER-GUIDE.md', title: 'Running the shop', group: 'Start' },
  { slug: 'changelog', file: 'CHANGELOG.md', title: "What's new", group: 'Start' },

  { slug: 'api', file: 'API.md', title: 'API reference', group: 'Build' },
  { slug: 'data-model', file: 'DATA-MODEL.md', title: 'Data model', group: 'Build' },
  { slug: 'database', file: 'DATABASE.md', title: 'Database schema', group: 'Build' },
  { slug: 'admin', file: 'ADMIN.md', title: 'Write API', group: 'Build' },
  { slug: 'checkout', file: 'CHECKOUT.md', title: 'Checkout & payments', group: 'Build' },
  { slug: 'errors', file: 'ERRORS.md', title: 'Errors', group: 'Build' },
  { slug: 'testing', file: 'TESTING.md', title: 'Testing', group: 'Build' },

  { slug: 'integration-prompt', file: 'INTEGRATION-PROMPT.md', title: 'Backend prompt', group: 'AI prompts' },
  { slug: 'schema-prompt', file: 'SCHEMA-PROMPT.md', title: 'Database prompt', group: 'AI prompts' },

  { slug: 'configuration', file: 'CONFIGURATION.md', title: 'Configuration', group: 'Operate' },
  { slug: 'performance', file: 'PERFORMANCE.md', title: 'Performance & scale', group: 'Operate' },
  { slug: 'cro', file: 'CRO.md', title: 'Trust & conversion', group: 'Operate' },
  { slug: 'theming', file: 'THEMING.md', title: 'Theming', group: 'Operate' },
  { slug: 'recipes', file: 'RECIPES.md', title: 'Odoo, Shopify, others', group: 'Operate' },
]

/** The canonical path for a document. */
export const docPath = (slug) => (slug === 'readme' ? '/docs' : `/docs/${slug}`)

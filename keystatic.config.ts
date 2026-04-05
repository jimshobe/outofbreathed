import { config, collection, fields } from '@keystatic/core';

const isDev = process.env.NODE_ENV === 'development';

export default config({
  storage: isDev
    ? { kind: 'local' }
    : {
        kind: 'github',
        repo: { owner: 'jimshobe', name: 'outofbreathed' },
        clientId: process.env.KEYSTATIC_GITHUB_CLIENT_ID!,
        clientSecret: process.env.KEYSTATIC_GITHUB_CLIENT_SECRET!,
        secret: process.env.KEYSTATIC_SECRET!,
      },

  collections: {
    blog: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'src/content/blog/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        date: fields.date({
          label: 'Date',
          defaultValue: { kind: 'today' },
          validation: { isRequired: true },
        }),
        excerpt: fields.text({
          label: 'Excerpt',
          description: 'Short summary shown in the stream. Optional.',
          multiline: true,
        }),
        mastodon_tag: fields.text({
          label: 'Mastodon tag',
          description: 'Hashtag (without #) linking this post to Mastodon updates from the same trip or event.',
        }),
        content: fields.document({
          label: 'Content',
          formatting: true,
          dividers: true,
          links: true,
          images: true,
        }),
      },
    }),
  },
});

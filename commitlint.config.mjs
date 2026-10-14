export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Dependabot bodies contain long URLs and release notes.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};

module.exports = {
  plugins: [
    {
      rules: {
        'commit-format': (parsed) => {
          const types = ['feature', 'bugfix', 'hotfix', 'design', 'refactor', 'test', 'doc'];
          const pattern = new RegExp(`^(${types.join('|')})\\/: .+$`, 'm');
          const valid = pattern.test(parsed.raw);
          return [valid, `Format must be: type/: description (types: ${types.join(', ')})`];
        },
      },
    },
  ],
  rules: {
    'commit-format': [2, 'always'],
  },
};

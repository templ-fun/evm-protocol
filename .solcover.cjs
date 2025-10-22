module.exports = {
  istanbulFolder: 'coverage/contracts',
  // Be explicit so mocks never affect protocol coverage
  skipFiles: [
    'mocks/**',
    'contracts/mocks/**'
  ]
};

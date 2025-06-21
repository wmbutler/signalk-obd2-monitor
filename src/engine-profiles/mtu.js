// MTU marine engine profiles
module.exports = {
  manufacturer: 'MTU',
  models: {
    'series-2000': {
      model: 'Series 2000',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    'series-4000': {
      model: 'Series 4000',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '46', '5C', '5E'
      ],
      customMappings: {}
    }
  }
}

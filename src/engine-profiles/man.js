// MAN marine engine profiles
module.exports = {
  manufacturer: 'MAN',
  models: {
    'i6-730': {
      model: 'i6-730',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    'i6-800': {
      model: 'i6-800',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    'v8-1000': {
      model: 'V8-1000',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '46', '5C', '5E'
      ],
      customMappings: {}
    }
  }
}

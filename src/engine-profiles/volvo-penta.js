// Volvo Penta marine engine profiles
module.exports = {
  manufacturer: 'Volvo Penta',
  models: {
    'd2-75': {
      model: 'D2-75',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '2F',
        '42', '5C'
      ],
      customMappings: {}
    },
    'd4-300': {
      model: 'D4-300',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    'd6-400': {
      model: 'D6-400',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '46', '5C', '5E'
      ],
      customMappings: {}
    }
  }
}

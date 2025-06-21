// John Deere marine engine profiles
module.exports = {
  manufacturer: 'John Deere',
  models: {
    '4045': {
      model: 'PowerTech 4045',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '2F',
        '42', '5C'
      ],
      customMappings: {}
    },
    '6068': {
      model: 'PowerTech 6068',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '42', '5C', '5E'
      ],
      customMappings: {}
    },
    '6090': {
      model: 'PowerTech 6090',
      supportedPids: [
        '04', '05', '0C', '0F', '11', '1F', '22', '23',
        '2F', '33', '42', '5C', '5E'
      ],
      customMappings: {}
    }
  }
}

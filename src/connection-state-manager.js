const EventEmitter = require('events')

class ConnectionStateManager extends EventEmitter {
  constructor(app) {
    super()
    this.app = app
    
    // Connection states
    this.STATES = {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      ADAPTER_CHECK: 'adapter_check',
      ENGINE_CHECK: 'engine_check',
      INITIALIZING: 'initializing',
      ACTIVE: 'active',
      PROBING: 'probing',
      ENGINE_OFF: 'engine_off'
    }
    
    // Current state
    this.state = this.STATES.DISCONNECTED
    
    // Health metrics
    this.lastSuccessfulData = null
    this.consecutiveFailures = 0
    this.lastProbeTime = null
    this.adapterInfo = null
    
    // Configuration
    this.maxConsecutiveFailures = 5
    this.probeInterval = 2000 // 2 seconds for quick recovery
    this.probeTimeout = null
  }
  
  setState(newState) {
    const oldState = this.state
    this.state = newState
    
    this.app.debug(`Connection state changed: ${oldState} → ${newState}`)
    
    this.emit('stateChange', {
      oldState,
      newState,
      timestamp: new Date()
    })
    
    // Clear probe timeout when leaving probe state
    if (oldState === this.STATES.PROBING && this.probeTimeout) {
      clearTimeout(this.probeTimeout)
      this.probeTimeout = null
    }
  }
  
  onConnected() {
    this.setState(this.STATES.CONNECTING)
  }
  
  onAdapterCheck() {
    this.setState(this.STATES.ADAPTER_CHECK)
  }
  
  onEngineCheck() {
    this.setState(this.STATES.ENGINE_CHECK)
  }
  
  onInitializing() {
    this.setState(this.STATES.INITIALIZING)
  }
  
  onEngineOff() {
    this.setState(this.STATES.ENGINE_OFF)
    this.consecutiveFailures = 0
  }
  
  onInitialized() {
    this.setState(this.STATES.ACTIVE)
    this.consecutiveFailures = 0
  }
  
  onDisconnected() {
    this.setState(this.STATES.DISCONNECTED)
    this.consecutiveFailures = 0
    this.lastSuccessfulData = null
  }
  
  onDataReceived(data) {
    // Valid data received
    this.lastSuccessfulData = new Date()
    this.consecutiveFailures = 0
    
    // If we were probing, switch back to active immediately
    if (this.state === this.STATES.PROBING) {
      this.app.debug('Valid data received while probing - switching to ACTIVE mode')
      this.setState(this.STATES.ACTIVE)
      this.emit('resumeNormalPolling')
    }
  }
  
  onNoData() {
    this.consecutiveFailures++
    
    this.app.debug(`NO DATA response received (${this.consecutiveFailures} consecutive failures)`)
    
    // Switch to probing mode after threshold
    if (this.state === this.STATES.ACTIVE && 
        this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.app.debug('Too many NO DATA responses - switching to PROBE mode')
      this.setState(this.STATES.PROBING)
      this.emit('startProbing')
    }
  }
  
  onProbeResponse(success, response) {
    this.lastProbeTime = new Date()
    
    if (success) {
      this.app.debug(`Probe successful: ${response}`)
      
      // Adapter is responding, try normal polling again
      this.setState(this.STATES.ACTIVE)
      this.consecutiveFailures = 0
      this.emit('resumeNormalPolling')
    } else {
      this.app.debug('Probe failed - adapter may be disconnected')
      
      // After multiple probe failures, consider disconnected
      if (this.consecutiveFailures > 10) {
        this.setState(this.STATES.DISCONNECTED)
        this.emit('connectionLost')
      }
    }
  }
  
  scheduleNextProbe() {
    if (this.state !== this.STATES.PROBING) return
    
    this.probeTimeout = setTimeout(() => {
      this.emit('probe')
    }, this.probeInterval)
  }
  
  getStatus() {
    return {
      state: this.state,
      lastSuccessfulData: this.lastSuccessfulData,
      consecutiveFailures: this.consecutiveFailures,
      timeSinceLastData: this.lastSuccessfulData ? 
        (Date.now() - this.lastSuccessfulData.getTime()) / 1000 : null,
      adapterInfo: this.adapterInfo
    }
  }
  
  setAdapterInfo(info) {
    this.adapterInfo = info
  }
}

module.exports = ConnectionStateManager

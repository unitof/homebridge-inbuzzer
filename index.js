var Accessory, Service, Characteristic, UUIDGen, Types;

const wpi = require('wiringpi-node');

module.exports = function(homebridge) {
    console.log("homebridge-gpio-device API version: " + homebridge.version);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    Types = homebridge.hapLegacyTypes;

    homebridge.registerAccessory("homebridge-gpio-device", "GPIODevice", DeviceAccesory);
}

function DeviceAccesory(log, config) {
  this.services = [];
  
  if(!config.type) throw new Error("'type' parameter is missing");
  if(!config.name) throw new Error("'name' parameter is missing for accessory " + config.type);
  if(!config.pin && !config.pins) throw new Error("'pin(s)' parameter is missing for accessory " + config.name);
  
  var infoService = new Service.AccessoryInformation();
  infoService.setCharacteristic(Characteristic.Manufacturer, 'Raspberry')
  infoService.setCharacteristic(Characteristic.Model, config.type)
  //infoService.setCharacteristic(Characteristic.SerialNumber, 'Raspberry');
  this.services.push(infoService);
  
  switch(config.type) {
    case 'ContactSensor':
      this.device = new DigitalInput(this, log, config);
    break;
    case 'Switch':
    case 'Lightbulb':
    case 'Outlet':
      this.device = new DigitalOutput(this, log, config);
    break;
    case 'MotionSensor':
      this.device = new PIRSensor(this, log, config);
    break;
    case 'Window':
    case 'WindowCovering':
      this.device = new RollerShutter(this, log, config);
    break;
    case 'LockMechanism':
      this.device = new LockMechanism(this, log, config);
    break;
    default:
      throw new Error("Unknown 'type' parameter : " + config.type);
    break;
  }
}

function LockMechanism(accesory, log, config) {
  this.log = log;
  this.pin = config.pin;
  this.inverted = config.inverted || false;
  this.duration = config.duration || false;
  
  wpi.pinMode(this.pin, wpi.OUTPUT);
  wpi.digitalWrite(this.pin, this.inverted ? wpi.HIGH : wpi.LOW);
  
  this.service = new Service[config.type](config.name);
  this.target = this.service.getCharacteristic(Characteristic.LockTargetState)
    .on('set', this.setLockState.bind(this))
    .updateValue(Characteristic.LockTargetState.SECURED);
  this.state = this.service.getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getLockState.bind(this))
    .updateValue(Characteristic.LockCurrentState.SECURED);
  
  accesory.addService(this.service);
}

LockMechanism.prototype = {
    setLockState: function(value, callback) {
      var that = this;
    var OPEN = this.inverted ? wpi.LOW : wpi.HIGH;
    var CLOSE = this.inverted ? wpi.HIGH : wpi.LOW;
    
    if(value == Characteristic.LockTargetState.UNSECURED) {
      wpi.digitalWrite(this.pin, OPEN);
      this.state.updateValue(Characteristic.LockCurrentState.UNSECURED);
      callback();
      if(this.duration) {
        setTimeout(function(){
          wpi.digitalWrite(that.pin, CLOSE);
          that.target.updateValue(Characteristic.LockTargetState.SECURED);
          that.state.updateValue(Characteristic.LockCurrentState.SECURED);
        }, this.duration * 1000);
      }
    } else {
      wpi.digitalWrite(that.pin, CLOSE);
      this.state.updateValue(Characteristic.LockCurrentState.SECURED);
      callback();
    }
  },
  
  getLockState: function(callback) {
    var state = wpi.digitalRead(this.pin);
    if(this.inverted)
      state = !state;
    callback(null, state ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED);
  }
}
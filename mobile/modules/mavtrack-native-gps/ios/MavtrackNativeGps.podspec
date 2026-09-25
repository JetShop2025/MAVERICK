Pod::Spec.new do |s|
  s.name           = 'MavtrackNativeGps'
  s.version        = '1.1.0'
  s.summary        = 'MAVTRACK native background fleet telemetry for iOS'
  s.description    = 'Native CLLocationManager and URLSession integration for MavDriver.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'MAVTRACK' => 'MAVTRACK' }
  s.homepage       = 'https://mavtrackfleet.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreLocation', 'Security', 'UIKit'
end

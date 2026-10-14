#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <U8g2lib.h>
#include <DHT.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <Adafruit_MLX90614.h>

// HARDWARE PINS
static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_DHT = 4;
static const int PIN_BUZZER = 25;
static const int PIN_LED = 26;
static const int PIN_SOS = 27;

// ALERT THRESHOLDS
static const float HR_ALERT_LOW_BPM = 50.0f;
static const float HR_ALERT_HIGH_BPM = 120.0f;
static const float HR_VALID_MIN_BPM = 25.0f;
static const float HR_VALID_MAX_BPM = 180.0f;

static const float TEMP_ALERT_HIGH_C = 32.0f;

// MAX30102 CONFIGURATION
static const long FINGER_IR_THRESHOLD = 5000;

static const int FINGER_OFF_SAMPLES = 40;
static const int FINGER_ON_SAMPLES = 8;

// Sensor configuration
static const int SAMPLE_RATE_HZ = 400;
static const int SAMPLE_AVERAGE = 4;
static const int EFFECTIVE_SPS = SAMPLE_RATE_HZ / SAMPLE_AVERAGE;
static const float SAMPLE_PERIOD_MS =
    1000.0f / EFFECTIVE_SPS;

// HEART RATE CONFIGURATION
static const byte BPM_WINDOW = 4;

// TIMING
static const unsigned long DHT_INTERVAL_MS = 3000;
static const unsigned long OLED_INTERVAL_MS = 200;
static const unsigned long SERIAL_INTERVAL_MS = 500;

// Publish sensor data to MQTT every 2 seconds.
static const unsigned long MQTT_PUBLISH_INTERVAL_MS = 2000;

// Try MQTT reconnect every 5 seconds.
static const unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;

// SOS button debounce.
static const unsigned long SOS_DEBOUNCE_MS = 40;

// WIFI CONFIGURATION
const char* WIFI_SSID = "AZM";
const char* WIFI_PASSWORD = "72162830";

// MQTT / FIWARE CONFIGURATION
const char* MQTT_SERVER = "192.168.8.187";

// Mosquitto port exposed by Docker.
static const uint16_t MQTT_PORT = 1883;

// FIWARE IoT Agent MQTT topic.
// This matches your existing FIWARE device registration.
const char* MQTT_TOPIC = "/smartwatch/smartwatch001/attrs";

// MQTT client ID.
const char* MQTT_CLIENT_ID =
    "smartwatch001";

// OBJECTS
U8G2_SH1106_128X64_NONAME_F_HW_I2C display(
    U8G2_R0,
    U8X8_PIN_NONE
);

MAX30105 particleSensor;

DHT dht(PIN_DHT, DHT11);
Adafruit_MLX90614 mlx = Adafruit_MLX90614();

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// HEART RATE VARIABLES
float bpmWindow[BPM_WINDOW];

byte bpmIndex = 0;
byte validBpmCount = 0;

uint32_t sampleCount = 0;
uint32_t lastBeatSample = 0;

long lastIr = 0;

int fingerOffCount = 0;
int fingerOnCount = 0;

bool fingerPresent = false;

bool beatFlash = false;
unsigned long beatFlashUntilMs = 0;

float instantBpm = 0;
float averageBpm = 0;
float displayBpm = 0;

// TEMPERATURE SENSOR READINGS
// Temporary presentation mode while the MLX90614 is unavailable.
static const bool DEMO_BODY_TEMPERATURE = true;
float bodyTemperatureC = NAN;
float ambientTemperatureC = NAN;
float humidityPct = NAN;

bool dhtOk = false;
bool mlxOk = false;
bool bodyTemperatureAvailable = false;
unsigned long bodyDemoStartMs = 0;
bool bodyDemoStarted = false;

// SOS VARIABLES
bool sosLatched = false;

bool lastSosRaw = true;

unsigned long lastSosChangeMs = 0;

// ALERT VARIABLES
bool hrAlert = false;
bool tempAlert = false;
bool alertActive = false;

// TIMERS
unsigned long lastDhtMs = 0;
unsigned long lastOledMs = 0;
unsigned long lastSerialMs = 0;

unsigned long lastMqttPublishMs = 0;
unsigned long lastMqttReconnectMs = 0;

// FUNCTION DECLARATIONS
void initializeMax30102();

void resetHeartRate();

void calculateAverageBpm();

void processIrSample(long irValue);

void sampleHeartRate();

void readTemperatures();

void readSosButton();

void evaluateAlerts();

void driveAlertOutputs();

void updateOled();

void printStatus();

void connectWiFi();

bool connectMQTT();

void maintainMQTT();

void publishHealthData();

void mqttCallback(
    char* topic,
    byte* payload,
    unsigned int length
);

// SETUP
void setup()
{
    Serial.begin(115200);

    delay(500);
    
    // GPIO INITIALIZATION
    pinMode(PIN_LED, OUTPUT);

    pinMode(PIN_BUZZER, OUTPUT);

    pinMode(PIN_SOS, INPUT_PULLUP);

    digitalWrite(PIN_LED, LOW);

    digitalWrite(PIN_BUZZER, LOW);

    // I2C INITIALIZATION
    Wire.begin(PIN_SDA, PIN_SCL);

    // MLX90614 uses SMBus timing (up to 100 kHz); keep the shared
    // OLED/MAX30102/MLX90614 bus at a compatible clock speed.
    Wire.setClock(100000);

    // OLED INITIALIZATION
    display.begin();
    display.setBusClock(100000);

    display.setFont(u8g2_font_6x10_tf);

    display.clearBuffer();

    display.drawStr(
        0,
        12,
        "Health Monitor"
    );

    display.drawStr(
        0,
        28,
        "Starting..."
    );

    display.sendBuffer();

    // DHT INITIALIZATION
    dht.begin();

    // MLX90614 body-temperature sensor (default I2C address 0x5A).
    mlxOk = mlx.begin(0x5A, &Wire);
    Serial.println(mlxOk ? "MLX90614 ready" : "MLX90614 not found; continuing without it");
    if (DEMO_BODY_TEMPERATURE)
        Serial.println("BODY TEMPERATURE DEMO enabled: 36.1, then 36.4 and 36.5 C");

    // MAX30102 INITIALIZATION
    initializeMax30102();

    resetHeartRate();

    // WIFI
    Serial.println();
    Serial.println(
        "========================================"
    );

    Serial.println(
        "SMART WEARABLE HEALTH MONITOR"
    );

    Serial.println(
        "========================================"
    );

    connectWiFi();

    // MQTT
    mqttClient.setServer(
        MQTT_SERVER,
        MQTT_PORT
    );

    mqttClient.setCallback(
        mqttCallback
    );

    mqttClient.setBufferSize(512);

    Serial.println();

    Serial.println(
        "Place a still finger on MAX30102"
    );

    Serial.println(
        "IoT system starting..."
    );
}

// MAIN LOOP
void loop()
{
    // HEART RATE
    sampleHeartRate();

    // SOS BUTTON
    readSosButton();

    // ALERT LOGIC
    evaluateAlerts();

    driveAlertOutputs();

    // CURRENT TIME
    const unsigned long now = millis();

    // DHT11 ambient temperature/humidity and MLX90614 object temperature.
    if (
        now - lastDhtMs >= DHT_INTERVAL_MS ||
        lastDhtMs == 0
    )
    {
        readTemperatures();
    }
    
    // WIFI / MQTT
    maintainMQTT();

    // MQTT PUBLISH
    if (
        mqttClient.connected() &&
        (
            now - lastMqttPublishMs >=
            MQTT_PUBLISH_INTERVAL_MS
        )
    )
    {
        lastMqttPublishMs = now;

        publishHealthData();
    }

    // OLED
    if (
        now - lastOledMs >= OLED_INTERVAL_MS
    )
    {
        lastOledMs = now;

        updateOled();
    }

    // SERIAL
    if (
        now - lastSerialMs >= SERIAL_INTERVAL_MS
    )
    {
        lastSerialMs = now;

        printStatus();
    }
}

// MAX30102 INITIALIZATION
void initializeMax30102()
{
    if (
        !particleSensor.begin(
            Wire,
            I2C_SPEED_STANDARD
        )
    )
    {
        Serial.println(
            "ERROR: MAX30102 not found"
        );

        display.clearBuffer();

        display.drawStr(
            0,
            12,
            "MAX30102 ERROR"
        );

        display.drawStr(
            0,
            28,
            "SDA GPIO21"
        );

        display.drawStr(
            0,
            44,
            "SCL GPIO22"
        );

        display.sendBuffer();

        while (true)
        {
            delay(1000);
        }
    }

    // MAX30102 CONFIGURATION
    particleSensor.setup(
        0x3F,
        SAMPLE_AVERAGE,
        2,
        SAMPLE_RATE_HZ,
        411,
        4096
    );

    particleSensor.setPulseAmplitudeRed(
        0x3F
    );

    particleSensor.setPulseAmplitudeIR(
        0x3F
    );

    particleSensor.setPulseAmplitudeGreen(
        0
    );

    particleSensor.clearFIFO();

    Serial.println(
        "MAX30102 ready"
    );
}

// RESET HEART RATE
void resetHeartRate()
{
    instantBpm = 0;

    averageBpm = 0;

    displayBpm = 0;

    bpmIndex = 0;

    validBpmCount = 0;

    lastBeatSample = 0;

    beatFlash = false;

    for (
        byte i = 0;
        i < BPM_WINDOW;
        i++
    )
    {
        bpmWindow[i] = 0;
    }
}

// CALCULATE AVERAGE BPM
void calculateAverageBpm()
{
    if (validBpmCount == 0)
    {
        averageBpm = 0;

        return;
    }

    float total = 0;

    for (
        byte i = 0;
        i < validBpmCount;
        i++
    )
    {
        total += bpmWindow[i];
    }

    averageBpm =
        total / validBpmCount;
}

// PROCESS MAX30102 IR SAMPLE
void processIrSample(
    long irValue
)
{
    sampleCount++;

    // FINGER REMOVED
    if (
        irValue < FINGER_IR_THRESHOLD
    )
    {
        fingerOnCount = 0;

        if (
            fingerOffCount <
            FINGER_OFF_SAMPLES
        )
        {
            fingerOffCount++;
        }

        if (
            fingerOffCount >=
            FINGER_OFF_SAMPLES &&
            fingerPresent
        )
        {
            fingerPresent = false;

            resetHeartRate();
        }

        return;
    }

    // FINGER DETECTED
    fingerOffCount = 0;

    if (
        fingerOnCount <
        FINGER_ON_SAMPLES
    )
    {
        fingerOnCount++;
    }

    if (
        fingerOnCount >=
        FINGER_ON_SAMPLES
    )
    {
        fingerPresent = true;
    }

    if (!fingerPresent)
    {
        return;
    }

    // BEAT DETECTION
    if (
        !checkForBeat(irValue)
    )
    {
        return;
    }

    // FIRST BEAT
    if (lastBeatSample == 0)
    {
        lastBeatSample =
            sampleCount;

        return;
    }

    // TIME BETWEEN BEATS
    const uint32_t deltaSamples =
        sampleCount -
        lastBeatSample;

    lastBeatSample =
        sampleCount;

    const float deltaMs =
        deltaSamples *
        SAMPLE_PERIOD_MS;

    if (deltaMs <= 0)
    {
        return;
    }

    instantBpm =
        60000.0f /
        deltaMs;

    // Reject implausible estimates while still allowing very low
    // readings to reach the low-heart-rate alert logic.
    if (
        instantBpm < HR_VALID_MIN_BPM ||
        instantBpm > HR_VALID_MAX_BPM
    )
    {
        return;
    }

    // STORE BPM
    bpmWindow[bpmIndex] =
        instantBpm;

    bpmIndex =
        (bpmIndex + 1) %
        BPM_WINDOW;

    if (
        validBpmCount <
        BPM_WINDOW
    )
    {
        validBpmCount++;
    }

    calculateAverageBpm();

    // SMOOTH DISPLAY BPM
    if (
        displayBpm < 1.0f
    )
    {
        displayBpm =
            instantBpm;
    }
    else
    {
        displayBpm =
            (0.45f * instantBpm) +
            (0.55f * displayBpm);
    }

    // OLED BEAT INDICATOR
    beatFlash = true;

    beatFlashUntilMs =
        millis() + 120;
}

// SAMPLE HEART RATE
void sampleHeartRate()
{
    particleSensor.check();

    while (
        particleSensor.available()
    )
    {
        lastIr =
            particleSensor.getFIFOIR();

        processIrSample(lastIr);

        particleSensor.nextSample();
    }

    if (
        beatFlash &&
        millis() > beatFlashUntilMs
    )
    {
        beatFlash = false;
    }
}

// READ DHT11 AMBIENT TEMPERATURE/HUMIDITY AND MLX90614 OBJECT TEMPERATURE
void readTemperatures()
{
    lastDhtMs = millis();

    const float h =
        dht.readHumidity();

    const float ambient =
        dht.readTemperature();

    if (
        isnan(h) ||
        isnan(ambient)
    )
    {
        dhtOk = false;
    }
    else
    {
        dhtOk = true;
        humidityPct = h;
        ambientTemperatureC = ambient;
    }

    if (DEMO_BODY_TEMPERATURE)
    {
        if (!bodyDemoStarted)
        {
            bodyDemoStarted = true;
            bodyDemoStartMs = millis();
        }
        const unsigned long elapsed = millis() - bodyDemoStartMs;
        bodyTemperatureC = elapsed < 10000UL ? 36.1f : elapsed < 20000UL ? 36.4f : 36.5f;
        bodyTemperatureAvailable = true;
    }
    else
    {
        const float objectTemperature = mlx.readObjectTempC();
        mlxOk = !isnan(objectTemperature);
        bodyTemperatureAvailable = mlxOk;
        bodyTemperatureC = mlxOk ? objectTemperature : NAN;
    }
}

// SOS BUTTON
void readSosButton()
{
    const bool raw =
        digitalRead(PIN_SOS);

    const unsigned long now =
        millis();

    if (
        raw != lastSosRaw
    )
    {
        lastSosChangeMs = now;

        lastSosRaw = raw;
    }

    static bool stable = true;

    static bool handledPress = false;

    if (
        now - lastSosChangeMs <
        SOS_DEBOUNCE_MS
    )
    {
        return;
    }

    if (
        stable != raw
    )
    {
        stable = raw;

        // Button pressed
        if (
            stable == LOW &&
            !handledPress
        )
        {
            sosLatched =
                !sosLatched;

            handledPress = true;

            Serial.println(
                sosLatched
                ? "SOS ON"
                : "SOS OFF"
            );
        }

        // Button released
        if (
            stable == HIGH
        )
        {
            handledPress = false;
        }
    }
}

// ALERT EVALUATION
void evaluateAlerts()
{
    hrAlert = false;

    if (
        validBpmCount >= 2
    )
    {
        hrAlert =
            (
                averageBpm <
                HR_ALERT_LOW_BPM
            ) ||
            (
                averageBpm >
                HR_ALERT_HIGH_BPM
            );
    }

    tempAlert =
        !DEMO_BODY_TEMPERATURE &&
        mlxOk &&
        !isnan(bodyTemperatureC) &&
        (
            bodyTemperatureC >=
            TEMP_ALERT_HIGH_C
        );

    alertActive =
        sosLatched ||
        hrAlert ||
        tempAlert;
}

// ALERT OUTPUTS
void driveAlertOutputs()
{
    if (!alertActive)
    {
        digitalWrite(
            PIN_LED,
            LOW
        );

        digitalWrite(
            PIN_BUZZER,
            LOW
        );

        return;
    }

    const bool pulseOn =
        ((millis() / 250) % 2) == 0;

    digitalWrite(
        PIN_LED,
        pulseOn
        ? HIGH
        : LOW
    );

    digitalWrite(
        PIN_BUZZER,
        pulseOn
        ? HIGH
        : LOW
    );
}

// WIFI CONNECTION
void connectWiFi()
{
    if (
        WiFi.status() ==
        WL_CONNECTED
    )
    {
        return;
    }

    Serial.println();

    Serial.print(
        "Connecting to Wi-Fi: "
    );

    Serial.println(
        WIFI_SSID
    );

    WiFi.mode(WIFI_STA);

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD
    );

    display.clearBuffer();

    display.setFont(
        u8g2_font_6x10_tf
    );

    display.drawStr(
        0,
        12,
        "WiFi connecting..."
    );

    display.sendBuffer();

    unsigned long start =
        millis();

    while (
        WiFi.status() !=
        WL_CONNECTED &&
        millis() - start <
        20000
    )
    {
        delay(500);

        Serial.print(".");
    }

    Serial.println();

    if (
        WiFi.status() ==
        WL_CONNECTED
    )
    {
        Serial.println(
            "Wi-Fi connected!"
        );

        Serial.print(
            "ESP32 IP: "
        );

        Serial.println(
            WiFi.localIP()
        );

        Serial.print(
            "Signal RSSI: "
        );

        Serial.println(
            WiFi.RSSI()
        );
    }
    else
    {
        Serial.println(
            "Wi-Fi connection failed."
        );

        Serial.println(
            "Check SSID/password."
        );
    }
}

// MQTT CONNECTION
bool connectMQTT()
{
    if (
        WiFi.status() !=
        WL_CONNECTED
    )
    {
        return false;
    }

    if (
        mqttClient.connected()
    )
    {
        return true;
    }

    Serial.println();

    Serial.print(
        "Connecting to MQTT: "
    );

    Serial.print(
        MQTT_SERVER
    );

    Serial.print(":");

    Serial.println(
        MQTT_PORT
    );

    if (
        mqttClient.connect(
            MQTT_CLIENT_ID
        )
    )
    {
        Serial.println(
            "MQTT connected!"
        );

        Serial.print(
            "MQTT topic: "
        );

        Serial.println(
            MQTT_TOPIC
        );

        // Send an initial message immediately.
        publishHealthData();

        return true;
    }

    Serial.print(
        "MQTT connection failed. State="
    );

    Serial.println(
        mqttClient.state()
    );

    return false;
}

// MAINTAIN WIFI + MQTT
void maintainMQTT()
{
    // WIFI LOST
    if (
        WiFi.status() !=
        WL_CONNECTED
    )
    {
        if (
            mqttClient.connected()
        )
        {
            mqttClient.disconnect();
        }

        if (
            millis() -
            lastMqttReconnectMs >=
            MQTT_RECONNECT_INTERVAL_MS
        )
        {
            lastMqttReconnectMs =
                millis();

            connectWiFi();
        }

        return;
    }

    // MQTT LOST
    if (
        !mqttClient.connected()
    )
    {
        if (
            millis() -
            lastMqttReconnectMs >=
            MQTT_RECONNECT_INTERVAL_MS
        )
        {
            lastMqttReconnectMs =
                millis();

            connectMQTT();
        }

        return;
    }

    // PROCESS MQTT
    mqttClient.loop();
}

// PUBLISH HEALTH DATA
void publishHealthData()
{
    if (
        !mqttClient.connected()
    )
    {
        return;
    }
    char payload[512];

    int heartRateToSend = 0;

    if (
        validBpmCount > 0 &&
        displayBpm > 0
    )
    {
        heartRateToSend =
            static_cast<int>(
                displayBpm + 0.5f
            );
    }

    int used = snprintf(
        payload,
        sizeof(payload),
        "{\"heartRate\":%d,\"sos\":%s,\"heartRateAlert\":%s,\"temperatureAlert\":%s,\"fingerPresent\":%s",
        heartRateToSend,
        sosLatched ? "true" : "false",
        hrAlert ? "true" : "false",
        tempAlert ? "true" : "false",
        fingerPresent ? "true" : "false"
    );

    if (bodyTemperatureAvailable && !isnan(bodyTemperatureC) && used > 0 && used < sizeof(payload))
    {
        used += snprintf(
            payload + used,
            sizeof(payload) - used,
            ",\"temperature\":%.1f",
            bodyTemperatureC
        );
    }

    if (used > 0 && used < sizeof(payload))
    {
        used += snprintf(payload + used, sizeof(payload) - used,
                         ",\"bodyTemperatureDemo\":%s",
                         DEMO_BODY_TEMPERATURE ? "true" : "false");
    }

    if (dhtOk && used > 0 && used < sizeof(payload))
    {
        used += snprintf(
            payload + used,
            sizeof(payload) - used,
            ",\"ambientTemperature\":%.1f,\"humidity\":%.1f",
            ambientTemperatureC,
            humidityPct
        );
    }

    if (used > 0 && used < sizeof(payload))
    {
        snprintf(payload + used, sizeof(payload) - used, "}");
    }

    bool success =
        mqttClient.publish(
            MQTT_TOPIC,
            payload
        );

    if (success)
    {
        Serial.print(
            "MQTT PUBLISH: "
        );

        Serial.println(
            payload
        );
    }
    else
    {
        Serial.println(
            "MQTT publish FAILED"
        );
    }
}

// MQTT CALLBACK
void mqttCallback(
    char* topic,
    byte* payload,
    unsigned int length
)
{
    Serial.print(
        "MQTT MESSAGE RECEIVED ["
    );

    Serial.print(topic);

    Serial.print("]: ");

    for (
        unsigned int i = 0;
        i < length;
        i++
    )
    {
        Serial.print(
            (char)payload[i]
        );
    }

    Serial.println();
}

// OLED DISPLAY
void updateOled()
{
    char line[32];

    display.clearBuffer();

    display.setFont(
        u8g2_font_6x10_tf
    );

    if (
        beatFlash
    )
    {
        display.drawStr(
            0,
            10,
            "Health Monitor *"
        );
    }
    else
    {
        display.drawStr(
            0,
            10,
            "Health Monitor"
        );
    }

    // BPM
    display.setFont(
        u8g2_font_ncenB18_tr
    );

    if (
        validBpmCount > 0
    )
    {
        snprintf(
            line,
            sizeof(line),
            "%d",
            static_cast<int>(
                displayBpm + 0.5f
            )
        );

        display.drawStr(
            0,
            36,
            line
        );

        display.setFont(
            u8g2_font_6x10_tf
        );

        display.drawStr(
            54,
            32,
            "BPM"
        );
    }
    else
    {
        display.setFont(
            u8g2_font_ncenB14_tr
        );

        display.drawStr(
            0,
            34,
            "-- BPM"
        );
    }

    // Body temperature from MLX90614 and ambient temperature from DHT11.
    display.setFont(
        u8g2_font_6x10_tf
    );

    if (bodyTemperatureAvailable && dhtOk)
    {
        snprintf(
            line,
            sizeof(line),
            DEMO_BODY_TEMPERATURE ? "D%.1fC A%.1fC" : "B%.1fC A%.1fC",
            bodyTemperatureC,
            ambientTemperatureC
        );
    }
    else if (bodyTemperatureAvailable)
    {
        snprintf(line, sizeof(line), DEMO_BODY_TEMPERATURE ? "DEMO %.1fC Ambient --" : "Body %.1fC Ambient --", bodyTemperatureC);
    }
    else if (dhtOk)
    {
        snprintf(line, sizeof(line), "Body -- Ambient %.1fC", ambientTemperatureC);
    }
    else
    {
        snprintf(line, sizeof(line), "Body -- Ambient --");
    }

    display.drawStr(
        0,
        48,
        line
    );

    // STATUS
    if (sosLatched)
    {
        display.drawStr(
            0,
            62,
            "ALERT: SOS"
        );
    }
    else if (hrAlert)
    {
        display.drawStr(
            0,
            62,
            "ALERT: HEART"
        );
    }
    else if (tempAlert)
    {
        display.drawStr(
            0,
            62,
            "ALERT: TEMP"
        );
    }
    else if (!fingerPresent)
    {
        snprintf(
            line,
            sizeof(line),
            "Place finger IR %ld",
            lastIr
        );

        display.drawStr(
            0,
            62,
            line
        );
    }
    else if (
        validBpmCount < 2
    )
    {
        display.drawStr(
            0,
            62,
            "Measuring..."
        );
    }
    else
    {
        snprintf(
            line,
            sizeof(line),
            "Live inst %d",
            static_cast<int>(
                instantBpm + 0.5f
            )
        );

        display.drawStr(
            0,
            62,
            line
        );
    }

    display.sendBuffer();
}

// SERIAL STATUS
void printStatus()
{
    Serial.print("IR=");

    Serial.print(lastIr);

    Serial.print(" inst=");

    Serial.print(
        instantBpm,
        1
    );

    Serial.print(" live=");

    Serial.print(
        displayBpm,
        1
    );

    Serial.print(" avg=");

    Serial.print(
        averageBpm,
        1
    );

    Serial.print(" beats=");

    Serial.print(
        validBpmCount
    );

    Serial.print(" Body=");
    if (bodyTemperatureAvailable) Serial.print(bodyTemperatureC, 1);
    else Serial.print("--");
    Serial.print("C Ambient=");
    if (dhtOk) Serial.print(ambientTemperatureC, 1);
    else Serial.print("--");
    Serial.print("C Humidity=");
    if (dhtOk) Serial.print(humidityPct, 0);
    else Serial.print("--");
    Serial.print("% MLX=");
    Serial.print(DEMO_BODY_TEMPERATURE ? "DEMO" : (mlxOk ? "OK" : "OFF"));
    Serial.print(" DHT=");
    Serial.print(dhtOk ? "OK" : "OFF");

    Serial.print(
        fingerPresent
        ? " FINGER"
        : " NO_FINGER"
    );

    Serial.print(
        " WiFi="
    );

    Serial.print(
        WiFi.status() ==
        WL_CONNECTED
        ? "OK"
        : "OFF"
    );

    Serial.print(
        " MQTT="
    );

    Serial.print(
        mqttClient.connected()
        ? "OK"
        : "OFF"
    );

    Serial.print(
        " SOS="
    );

    Serial.print(
        sosLatched
        ? "ON"
        : "OFF"
    );

    Serial.print("HR_ALERT=");
    Serial.print(hrAlert ? "ON" : "OFF");

    Serial.print(" TEMP_ALERT=");
    Serial.print(tempAlert ? "ON" : "OFF");

    Serial.print(" ALERT=");
    Serial.println(
        alertActive
        ? "ON"
        : "OFF"
    );
}

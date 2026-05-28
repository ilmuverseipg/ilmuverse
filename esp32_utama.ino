// ============================================================
// ILMUVERSE — ESP32 UTAMA (NEXUS-UTAMA)
// Versi: 2.0 | Kemaskini untuk ILMUVERSE System
// ============================================================
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>

// ============================================================
// KONFIGURASI — EDIT BAHAGIAN INI
// ============================================================
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "KATA_LALUAN_WIFI";
const char* SERVER_HOST   = "ilmuverse.onrender.com"; // Tukar kepada domain Render.com anda
const int   SERVER_PORT   = 443;  // 443 untuk HTTPS/WSS
const char* SERVER_PATH   = "/esp32";
// ============================================================

// PIN DEFINISI
#define PIN_NFC_SS    5
#define PIN_NFC_RST   27
#define PIN_SERVO     26
#define PIN_BUZZER    25
#define PIN_LED_RED   2
#define PIN_LED_YEL   33
#define PIN_LED_GRN   32
#define LCD_ADDR      0x27
#define LCD_COLS      16
#define LCD_ROWS      2

// OBJEK
MFRC522 nfc(PIN_NFC_SS, PIN_NFC_RST);
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
Servo servo;
WebSocketsClient wsClient;

// STATE
bool wsDisambung = false;
unsigned long masaSelepasNFC = 0;
const unsigned long DEBOUNCE_NFC = 1500; // ms
int modSemasa = 0;

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  
  // Pin output
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_YEL, OUTPUT);
  pinMode(PIN_LED_GRN, OUTPUT);
  
  // LCD
  Wire.begin();
  lcd.init();
  lcd.backlight();
  
  // Servo
  ESP32PWM::allocateTimer(0);
  servo.setPeriodHertz(50);
  servo.attach(PIN_SERVO, 500, 2400);
  servo.write(0);
  
  // NFC
  SPI.begin();
  nfc.PCD_Init();
  
  // Urutan boot
  urutanBoot();
  
  // Sambung WiFi
  sambungWiFi();
  
  // Sambung WebSocket
  sambungWS();
}

void loop() {
  wsClient.loop();
  
  // Baca NFC
  if (!nfc.PICC_IsNewCardPresent()) {
    digitalWrite(PIN_LED_YEL, HIGH);
    delay(50);
    digitalWrite(PIN_LED_YEL, LOW);
    return;
  }
  if (!nfc.PICC_ReadCardSerial()) return;
  
  // Debounce NFC
  if (millis() - masaSelepasNFC < DEBOUNCE_NFC) {
    nfc.PICC_HaltA();
    return;
  }
  masaSelepasNFC = millis();
  
  // Baca UID
  String uid = "";
  for (byte i = 0; i < nfc.uid.size; i++) {
    uid += String(nfc.uid.uidByte[i] < 0x10 ? " 0" : " ");
    uid += String(nfc.uid.uidByte[i], HEX);
  }
  uid.trim();
  uid.toUpperCase();
  
  Serial.print("[NFC] UID: ");
  Serial.println(uid);
  
  // Hantar ke server
  if (wsDisambung) {
    StaticJsonDocument<128> doc;
    doc["jenis"] = "nfc_scan";
    doc["uid"] = uid;
    String output;
    serializeJson(doc, output);
    wsClient.sendTXT(output);
    
    // Bunyi scan
    beepSingkat();
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Mengimbas...");
    lcd.setCursor(0, 1); lcd.print(uid);
  } else {
    lcd.clear();
    lcd.print("Tiada Sambungan!");
    kelipLampu(PIN_LED_RED, 2, 200);
  }
  
  nfc.PICC_HaltA();
  nfc.PCD_StopCrypto1();
}

// ============================================================
// WEBSOCKET
// ============================================================
void sambungWS() {
  Serial.println("[WS] Menyambung ke server...");
  lcd.clear();
  lcd.print("Sambung server..");
  
  // Guna WSS (SSL) untuk Render.com
  wsClient.beginSSL(SERVER_HOST, SERVER_PORT, SERVER_PATH);
  wsClient.onEvent(wsEvent);
  wsClient.setReconnectInterval(3000);
  wsClient.enableHeartbeat(15000, 3000, 2);
}

void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      wsDisambung = false;
      Serial.println("[WS] Putus sambungan");
      lcd.clear();
      lcd.print("Tiada Sambungan");
      lcd.setCursor(0,1); lcd.print("Cuba semula...");
      kelipLampu(PIN_LED_RED, 3, 150);
      break;
      
    case WStype_CONNECTED:
      wsDisambung = true;
      Serial.println("[WS] Bersambung!");
      lcd.clear();
      lcd.print("Bersambung!");
      lcd.setCursor(0,1); lcd.print("Sedia...");
      
      // Kelip hijau tanda berjaya
      for(int i=0; i<3; i++){
        digitalWrite(PIN_LED_GRN, HIGH); delay(100);
        digitalWrite(PIN_LED_GRN, LOW); delay(100);
      }
      
      // Hantar status siap
      wsClient.sendTXT("{\"jenis\":\"siap\"}");
      paparSedia();
      break;
      
    case WStype_TEXT: {
      String msg = String((char*)payload);
      Serial.print("[WS] Terima: ");
      Serial.println(msg);
      prosesArahan(msg);
      break;
    }
    
    default: break;
  }
}

void prosesArahan(String msg) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) return;
  
  const char* jenis = doc["jenis"];
  
  if (strcmp(jenis, "betul") == 0) {
    animasiBetul();
    
  } else if (strcmp(jenis, "salah") == 0) {
    animasiSalah();
    
  } else if (strcmp(jenis, "buka_servo") == 0) {
    unsigned long tempoh = doc["tempoh"] | 6000;
    bukaGanjaran(tempoh);
    
  } else if (strcmp(jenis, "set_mod") == 0) {
    modSemasa = doc["mod"] | 1;
    lcd.clear();
    lcd.print("MOD ");
    lcd.print(modSemasa);
    lcd.print(" AKTIF");
    delay(1500);
    paparSedia();
    
  } else if (strcmp(jenis, "sedia_jawab") == 0) {
    lcd.clear();
    lcd.print("Imbas Jawapan");
    lcd.setCursor(0,1); lcd.print("Sekarang...");
    digitalWrite(PIN_LED_YEL, HIGH);
    delay(500);
    digitalWrite(PIN_LED_YEL, LOW);
  }
}

// ============================================================
// ANIMASI & BUNYI
// ============================================================
void beepSingkat() {
  ledcAttach(PIN_BUZZER, 2000, 8);
  ledcWriteTone(PIN_BUZZER, 2000);
  delay(80);
  ledcWriteTone(PIN_BUZZER, 0);
}

void animasiBetul() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("✓ BETUL! TAHNIAH");
  
  // Lampu hijau dan bunyi menaik
  digitalWrite(PIN_LED_GRN, HIGH);
  ledcAttach(PIN_BUZZER, 1000, 8);
  for (int f = 1000; f <= 3000; f += 150) {
    ledcWriteTone(PIN_BUZZER, f);
    delay(25);
  }
  ledcWriteTone(PIN_BUZZER, 0);
  
  kelipLampu(PIN_LED_GRN, 3, 120);
}

void animasiSalah() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("✗ SALAH!");
  lcd.setCursor(0, 1); lcd.print("Cuba Lagi");
  
  // Lampu merah dan bunyi menurun
  digitalWrite(PIN_LED_RED, HIGH);
  ledcAttach(PIN_BUZZER, 1000, 8);
  for (int i = 0; i < 3; i++) {
    ledcWriteTone(PIN_BUZZER, 600); delay(100);
    ledcWriteTone(PIN_BUZZER, 300); delay(150);
  }
  ledcWriteTone(PIN_BUZZER, 0);
  
  kelipLampu(PIN_LED_RED, 3, 150);
}

void bukaGanjaran(unsigned long tempoh) {
  lcd.clear();
  lcd.print("★ TAHNIAH! ★");
  lcd.setCursor(0, 1); lcd.print("Ambil Ganjaran!");
  
  // Bunyi ganjaran khas
  ledcAttach(PIN_BUZZER, 1000, 8);
  int melodi[] = {523, 659, 784, 1047};
  for (int n : melodi) {
    ledcWriteTone(PIN_BUZZER, n);
    delay(180);
  }
  ledcWriteTone(PIN_BUZZER, 0);
  
  servo.write(90);
  
  unsigned long mula = millis();
  while (millis() - mula < tempoh) {
    digitalWrite(PIN_LED_GRN, HIGH); delay(150);
    digitalWrite(PIN_LED_GRN, LOW); delay(150);
  }
  
  servo.write(0);
  delay(800);
  
  lcd.clear();
  lcd.print("Ganjaran Tutup");
  delay(1500);
  paparSedia();
}

void kelipLampu(int pin, int kali, int ms) {
  for (int i = 0; i < kali; i++) {
    digitalWrite(pin, HIGH); delay(ms);
    digitalWrite(pin, LOW); delay(ms);
  }
}

// ============================================================
// LCD PAPARAN
// ============================================================
void paparSedia() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Sila Imbas Kad");
  lcd.setCursor(0, 1);
  if (modSemasa > 0) {
    lcd.print("Mod "); lcd.print(modSemasa); lcd.print(" Aktif");
  } else {
    lcd.print("Menunggu Arahan");
  }
}

// ============================================================
// BOOT SEQUENCE
// ============================================================
void urutanBoot() {
  // SELAMAT DATANG
  lcd.setCursor(3, 0); lcd.print("SELAMAT");
  lcd.setCursor(3, 1); lcd.print("DATANG!");
  digitalWrite(PIN_LED_RED, HIGH);
  delay(1500);
  
  lcd.clear();
  lcd.setCursor(2, 0); lcd.print("ILMUVERSE");
  delay(1000);
  
  lcd.clear();
  lcd.setCursor(1, 0); lcd.print("by FUTURE MINDS");
  delay(1000);
  
  // Lampu merah menyala semasa menunggu WiFi
  lcd.clear();
  lcd.print("Menyambung WiFi");
  lcd.setCursor(0, 1); lcd.print("Tunggu...");
  digitalWrite(PIN_LED_RED, HIGH);
  digitalWrite(PIN_LED_YEL, LOW);
  digitalWrite(PIN_LED_GRN, LOW);
}

// ============================================================
// SAMBUNGAN WIFI
// ============================================================
void sambungWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int cuba = 0;
  
  while (WiFi.status() != WL_CONNECTED && cuba < 30) {
    delay(500);
    lcd.setCursor(cuba % 16, 1);
    lcd.print(".");
    cuba++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    // WiFi berjaya — lampu merah padam, hijau kelip 3x
    digitalWrite(PIN_LED_RED, LOW);
    
    lcd.clear();
    lcd.print("WiFi Disambung!");
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP().toString());
    
    // Beep ringkas futuristik
    ledcAttach(PIN_BUZZER, 1000, 8);
    ledcWriteTone(PIN_BUZZER, 1500); delay(80);
    ledcWriteTone(PIN_BUZZER, 2500); delay(80);
    ledcWriteTone(PIN_BUZZER, 0);
    
    // Kelip hijau 3x laju
    for(int i=0; i<3; i++){
      digitalWrite(PIN_LED_GRN, HIGH); delay(100);
      digitalWrite(PIN_LED_GRN, LOW); delay(100);
    }
    delay(1000);
    
    lcd.clear();
    lcd.print("Menunggu Arahan");
    
  } else {
    lcd.clear();
    lcd.print("WiFi GAGAL!");
    lcd.setCursor(0, 1); lcd.print("Restart ESP32");
    kelipLampu(PIN_LED_RED, 10, 200);
    ESP.restart();
  }
}

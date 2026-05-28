// ============================================================
// ILMUVERSE — ESP32-CAM (NEXUS-CAM)
// Versi: 1.0 | Edge Impulse YOLO + WebSocket
// ============================================================
// PERKAKASAN DIPERLUKAN: AI Thinker ESP32-CAM
// ============================================================
// SEBELUM UPLOAD:
// 1. Buka Edge Impulse Studio -> Deployment -> Arduino Library
// 2. Muat turun .zip dan tambah ke Arduino IDE (Sketch > Include Library > Add .ZIP)
// 3. Tukar NAMA_PROJEK_EDGE_IMPULSE di bawah kepada nama model anda
// ============================================================

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "base64.hpp"

// TUKAR KEPADA NAMA LIBRARY EDGE IMPULSE ANDA:
// Contoh: #include <pantun_pantun_inferencing.h>
#include <NAMA_PROJEK_EDGE_IMPULSE_inferencing.h>
#include "edge-impulse-sdk/dsp/image/image.hpp"

// ============================================================
// KONFIGURASI — EDIT BAHAGIAN INI
// ============================================================
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "KATA_LALUAN_WIFI";
const char* SERVER_HOST   = "ilmuverse.onrender.com"; // Domain Render.com anda
const int   SERVER_PORT   = 443;
const char* SERVER_PATH   = "/cam";

// Edge Impulse — Input Dimension (dari Studio > Dashboard > Target)
// Contoh: 96x96 pixels
#define EI_CAMERA_RAW_FRAME_BUFFER_COLS   96  // TUKAR MENGIKUT MODEL ANDA
#define EI_CAMERA_RAW_FRAME_BUFFER_ROWS   96  // TUKAR MENGIKUT MODEL ANDA

// Threshold keyakinan (0.0 - 1.0)
#define CONFIDENCE_THRESHOLD 0.65
// ============================================================

// Pin Kamera AI Thinker
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define LED_GPIO_NUM       4  // Flash LED

WebSocketsClient wsClient;
bool wsDisambung = false;
bool modAktif = false;
bool scanDiminta = false;
String kategoriSemasa = "sihat";
bool flashNyala = false;

// Buffer untuk inferens
static uint8_t *snapshot_buf;

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  
  // Flash LED
  pinMode(LED_GPIO_NUM, OUTPUT);
  digitalWrite(LED_GPIO_NUM, LOW);
  
  // Init kamera
  if (!initKamera()) {
    Serial.println("[CAM] Kamera gagal! Restart...");
    delay(3000);
    ESP.restart();
  }
  
  Serial.println("[CAM] Kamera OK");
  
  // Sambung WiFi
  sambungWiFi();
  
  // Sambung WebSocket
  sambungWS();
  
  // Allocate buffer
  snapshot_buf = (uint8_t*)malloc(EI_CAMERA_RAW_FRAME_BUFFER_COLS * EI_CAMERA_RAW_FRAME_BUFFER_ROWS * 3);
}

void loop() {
  wsClient.loop();
  
  // Hantar frame langsung (tiap 100ms) jika mod aktif
  static unsigned long masaFrame = 0;
  if (wsDisambung && modAktif && millis() - masaFrame > 100) {
    masaFrame = millis();
    hantarFrameLangsung();
  }
  
  // Proses scan jika diminta
  if (scanDiminta) {
    scanDiminta = false;
    prosesInferens();
  }
}

// ============================================================
// WEBSOCKET
// ============================================================
void sambungWS() {
  wsClient.beginSSL(SERVER_HOST, SERVER_PORT, SERVER_PATH);
  wsClient.onEvent(wsEvent);
  wsClient.setReconnectInterval(3000);
  wsClient.enableHeartbeat(15000, 3000, 2);
}

void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch(type) {
    case WStype_CONNECTED:
      wsDisambung = true;
      Serial.println("[WS-CAM] Bersambung!");
      break;
      
    case WStype_DISCONNECTED:
      wsDisambung = false;
      modAktif = false;
      Serial.println("[WS-CAM] Putus");
      break;
      
    case WStype_TEXT: {
      String msg = String((char*)payload);
      prosesArahan(msg);
      break;
    }
    
    default: break;
  }
}

void prosesArahan(String msg) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, msg)) return;
  
  const char* jenis = doc["jenis"];
  
  if (strcmp(jenis, "mula_mod4") == 0) {
    modAktif = true;
    Serial.println("[CAM] Mod 4 aktif");
    
  } else if (strcmp(jenis, "mula_scan") == 0) {
    kategoriSemasa = doc["kategori"] | "sihat";
    scanDiminta = true;
    Serial.print("[CAM] Scan diminta, kategori: ");
    Serial.println(kategoriSemasa);
    
  } else if (strcmp(jenis, "flash") == 0) {
    flashNyala = doc["nyala"] | false;
    digitalWrite(LED_GPIO_NUM, flashNyala ? HIGH : LOW);
    Serial.print("[CAM] Flash: "); Serial.println(flashNyala ? "ON" : "OFF");
    
  } else if (strcmp(jenis, "mod_tamat") == 0) {
    modAktif = false;
    digitalWrite(LED_GPIO_NUM, LOW);
  }
}

// ============================================================
// FRAME LANGSUNG (MJPEG)
// ============================================================
void hantarFrameLangsung() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return;
  
  // Encode base64
  size_t b64Len = encode_base64_length(fb->len);
  uint8_t* b64 = (uint8_t*)malloc(b64Len);
  if (b64) {
    encode_base64(fb->buf, fb->len, b64);
    
    StaticJsonDocument<64> doc;
    doc["jenis"] = "cam_frame";
    // Hantar dalam 2 bahagian untuk elak overflow
    String header;
    serializeJson(doc, header);
    // Untuk frame, guna format mudah
    String payload = "{\"jenis\":\"cam_frame\",\"data\":\"";
    payload += String((char*)b64).substring(0, min((size_t)1024, b64Len)); // Sampel
    payload += "\"}";
    wsClient.sendTXT(payload);
    free(b64);
  }
  
  esp_camera_fb_return(fb);
}

// ============================================================
// INFERENS EDGE IMPULSE
// ============================================================
void prosesInferens() {
  Serial.println("[CAM] Memulakan inferens...");
  
  // Ambil gambar
  if (!ambilGambarUntukInferens(snapshot_buf, EI_CAMERA_RAW_FRAME_BUFFER_COLS, EI_CAMERA_RAW_FRAME_BUFFER_ROWS)) {
    Serial.println("[CAM] Gagal ambil gambar");
    return;
  }
  
  // Setup signal untuk Edge Impulse
  ei::signal_t signal;
  signal.total_length = EI_CAMERA_RAW_FRAME_BUFFER_COLS * EI_CAMERA_RAW_FRAME_BUFFER_ROWS;
  signal.get_data = &ei_camera_get_data;
  
  // Jalankan inferens
  ei_impulse_result_t result = { 0 };
  EI_IMPULSE_ERROR err = run_classifier(&signal, &result, false);
  
  if (err != EI_IMPULSE_OK) {
    Serial.print("[CAM] Ralat inferens: "); Serial.println(err);
    return;
  }
  
  // Cari label dengan keyakinan tertinggi
  String labelTerbaik = "tidak dikenal";
  float keyakinanTerbaik = 0.0;
  
  #if EI_CLASSIFIER_OBJECT_DETECTION == 1
  // YOLO Object Detection
  for (size_t ix = 0; ix < result.bounding_boxes_count; ix++) {
    auto bb = result.bounding_boxes[ix];
    if (bb.value > keyakinanTerbaik) {
      keyakinanTerbaik = bb.value;
      labelTerbaik = String(bb.label);
    }
  }
  #else
  // Klasifikasi biasa
  for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
    if (result.classification[ix].value > keyakinanTerbaik) {
      keyakinanTerbaik = result.classification[ix].value;
      labelTerbaik = String(result.classification[ix].label);
    }
  }
  #endif

  Serial.print("[CAM] Keputusan: "); Serial.print(labelTerbaik);
  Serial.print(" ("); Serial.print(keyakinanTerbaik); Serial.println(")");
  
  // Hantar keputusan ke server
  StaticJsonDocument<256> doc;
  doc["jenis"] = "cam_result";
  doc["label"] = labelTerbaik;
  doc["confidence"] = keyakinanTerbaik;
  doc["kategori"] = kategoriSemasa;
  doc["yakin"] = (keyakinanTerbaik >= CONFIDENCE_THRESHOLD);
  
  String output;
  serializeJson(doc, output);
  wsClient.sendTXT(output);
}

bool ambilGambarUntukInferens(uint8_t* buffer, size_t cols, size_t rows) {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return false;
  
  bool ok = false;
  if (fb->format == PIXFORMAT_JPEG) {
    // Decode JPEG dan resize
    bool decoded = fmt2rgb888(fb->buf, fb->len, PIXFORMAT_JPEG, snapshot_buf);
    if (decoded) {
      // Crop dan resize ke dimensi model
      ei::image::processing::crop_and_interpolate_rgb888(
        snapshot_buf, fb->width, fb->height,
        buffer, cols, rows
      );
      ok = true;
    }
  }
  
  esp_camera_fb_return(fb);
  return ok;
}

static int ei_camera_get_data(size_t offset, size_t length, float *out_ptr) {
  size_t pixel_ix = offset * 3;
  size_t pixels_left = length;
  size_t out_ptr_ix = 0;
  
  while (pixels_left != 0) {
    out_ptr[out_ptr_ix] = (snapshot_buf[pixel_ix] << 16) + (snapshot_buf[pixel_ix+1] << 8) + snapshot_buf[pixel_ix+2];
    out_ptr_ix++;
    pixel_ix += 3;
    pixels_left--;
  }
  return 0;
}

// ============================================================
// INIT KAMERA
// ============================================================
bool initKamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QVGA; // 320x240
  config.jpeg_quality = 12;
  config.fb_count     = 1;
  
  esp_err_t err = esp_camera_init(&config);
  return (err == ESP_OK);
}

// ============================================================
// SAMBUNGAN WIFI
// ============================================================
void sambungWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Menyambung");
  
  int cuba = 0;
  while (WiFi.status() != WL_CONNECTED && cuba < 40) {
    delay(500);
    Serial.print(".");
    cuba++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Berjaya! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Gagal! Restart...");
    delay(3000);
    ESP.restart();
  }
}

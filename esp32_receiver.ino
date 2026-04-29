// ตัวรับ (Receiver) - อัปเดตเพิ่มการจับเวลาและส่งข้อมูลเข้าเซิร์ฟเวอร์
#include <esp_now.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ================== ตั้งค่า WiFi & เซิร์ฟเวอร์ ==================
const char* ssid = "Ice's iPhone";           // เปลี่ยนเป็นชื่อ WiFi ของคุณ
const char* password = "Ice22547";   // เปลี่ยนเป็นรหัสผ่าน WiFi ของคุณ
// ลิงก์เชื่อมโยงกับเซิร์ฟเวอร์บน Vercel
const char* serverUrl = "https://reaction-puce.vercel.app/api/record_reaction"; 
// ========================================================

// ---------------- กำหนดขา PIN ----------------
const int relayRedPin = 32;    
const int relayYellowPin = 33;
const int relayGreenPin = 25;  

const int btnRedPin = 27;    
const int btnYellowPin = 14;
const int btnGreenPin = 12;  
const int buzzerPin = 26;    
const int footSwitchPin = 13;

// 🔴 ตั้งค่าสถานะสำหรับ Relay (Active LOW: LOW = ON, HIGH = OFF)
#define RELAY_ON   LOW  
#define RELAY_OFF  HIGH  

#define BUZZER_ON  HIGH
#define BUZZER_OFF LOW

int lastBtnRed = HIGH, lastBtnYellow = HIGH, lastBtnGreen = HIGH, lastFootSwitch = HIGH;

// โครงสร้างข้อมูลที่รับจากตัวส่ง (ต้องเหมือนตัวส่ง 100%)
typedef struct msg_to_rx {
  bool red_on;
  bool yellow_on;
  bool green_on;
  bool sound_mode;
  bool sound_enabled; // เพิ่มตัวแปรนี้เพื่อให้ตรงกับตัวส่ง
} msg_to_rx;

// โครงสร้างข้อมูลส่งกลับไปหาตัวส่ง
typedef struct msg_to_tx {
  bool override_red;
  bool override_yellow;
  bool override_green;
  bool override_sound;
} msg_to_tx;

msg_to_rx incomingData;
msg_to_tx myDataToSend = {false, false, false, false};

uint8_t senderAddress[6];
bool isSenderAdded = false;

// ================== ตัวแปรสำหรับจับเวลา ==================
unsigned long startTime = 0;
bool isTiming = false;
// ====================================================

void OnDataRecv(const esp_now_recv_info_t * esp_now_info, const uint8_t *incoming, int len) {
  memcpy(&incomingData, incoming, sizeof(incomingData));

  if (!isSenderAdded) {
    memcpy(senderAddress, esp_now_info->src_addr, 6);
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, senderAddress, 6);
    peerInfo.channel = 0;  
    peerInfo.encrypt = false;
    if (esp_now_add_peer(&peerInfo) == ESP_OK) {
      isSenderAdded = true;
      Serial.println("\n✅ [PAIRING] จับคู่กับตัวส่งสำเร็จ! บันทึก MAC Address แล้ว");
    }
  }

  // --- 🔍 พิมพ์ข้อมูลที่ได้รับจากตัวส่ง ---
  Serial.print("[RX] 📥 Data -> R:"); Serial.print(incomingData.red_on);
  Serial.print(" Y:"); Serial.print(incomingData.yellow_on);
  Serial.print(" G:"); Serial.print(incomingData.green_on);
  Serial.print(" | SndMode:"); Serial.print(incomingData.sound_mode);
  Serial.print(" | SndEn:"); Serial.print(incomingData.sound_enabled);

  bool isAnyLightOn = incomingData.red_on || incomingData.yellow_on || incomingData.green_on;

  // --- ลอจิกการทำงาน ---
  if (incomingData.sound_mode) {
    Serial.print(" >> 🔊 [โหมดเสียง] ");
    // โหมดเสียง: ปิดไฟทุกดวง
    digitalWrite(relayRedPin, RELAY_OFF);
    digitalWrite(relayYellowPin, RELAY_OFF);
    digitalWrite(relayGreenPin, RELAY_ON); // (ตามลอจิกเดิมของคุณ)
    
    // บัซเซอร์จะดังก็ต่อเมื่อ (มีการกดปุ่มไฟ) และ (เปิดสวิตช์ Master Sound)
    if (incomingData.sound_enabled && isAnyLightOn) {
      digitalWrite(buzzerPin, BUZZER_ON);
      Serial.print("Buzzer: ON 🎵");
      
      if (!isTiming) {
        startTime = millis(); // เริ่มจับเวลา
        isTiming = true;
      }
    } else {
      digitalWrite(buzzerPin, BUZZER_OFF);
      Serial.print("Buzzer: OFF 🔇");
    }
  } else {
    Serial.print(" >> 💡 [โหมดไฟ] ");
    // โหมดไฟ: ปิด Buzzer และเปิด Relay ตามปุ่มที่กด
    digitalWrite(buzzerPin, BUZZER_OFF);
    digitalWrite(relayRedPin, incomingData.red_on ? RELAY_ON : RELAY_OFF);
    digitalWrite(relayYellowPin, incomingData.yellow_on ? RELAY_ON : RELAY_OFF);
    digitalWrite(relayGreenPin, incomingData.green_on ? RELAY_OFF : RELAY_ON); // (ตามลอจิกเดิมของคุณ)

    // พิมพ์เช็คสถานะรีเลย์ (พิมพ์เฉพาะอันที่ถูกเปิด)
    if(incomingData.red_on) Serial.print("Relay: RED ON 🔴");
    else if(incomingData.yellow_on) Serial.print("Relay: YELLOW ON 🟡");
    else if(incomingData.green_on) Serial.print("Relay: GREEN OFF 🟢"); // (ตามลอจิกของคุณ)
    else Serial.print("Relay: All OFF");

    if (isAnyLightOn && !isTiming) {
      startTime = millis(); // เริ่มจับเวลา
      isTiming = true;
    }
  }
  Serial.println(); // ขึ้นบรรทัดใหม่เมื่อประมวลผลเสร็จ 1 ครั้ง
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n🚀 เริ่มการทำงานบอร์ดตัวรับ (Receiver)...");
  
  // ปิดทุกอย่างก่อนเริ่ม
  pinMode(relayRedPin, OUTPUT);
  pinMode(relayYellowPin, OUTPUT);
  pinMode(relayGreenPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(relayRedPin, RELAY_OFF);
  digitalWrite(relayYellowPin, RELAY_OFF);
  digitalWrite(relayGreenPin, RELAY_ON);
  digitalWrite(buzzerPin, BUZZER_OFF);

  pinMode(btnRedPin, INPUT_PULLUP);
  pinMode(btnYellowPin, INPUT_PULLUP);
  pinMode(btnGreenPin, INPUT_PULLUP);
  pinMode(footSwitchPin, INPUT_PULLUP);  

  // เชื่อมต่อ WiFi
  WiFi.mode(WIFI_AP_STA); 
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  if (esp_now_init() != ESP_OK) {
    Serial.println("❌ Error initializing ESP-NOW");
    return;
  }
  esp_now_register_recv_cb(OnDataRecv);
  Serial.println("✅ ESP-NOW Initialized. Waiting for sender...");
}

void sendOverrideCommand() {
  if (isSenderAdded) {
    esp_now_send(senderAddress, (uint8_t *) &myDataToSend, sizeof(myDataToSend));
    Serial.println("  -> 📤 [TX] ส่งคำสั่ง Override ไปยังตัวส่งเรียบร้อย!");
  } else {
    Serial.println("  -> ⚠️ [ERROR] ยังไม่ได้จับคู่กับตัวส่ง ส่ง Override ไม่ได้!");
  }
}

// ฟังก์ชันสำหรับยิง HTTP POST ข้อมูลเวลาเข้า Database
void sendReactionTime(float reactionTime) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure *client = new WiFiClientSecure;
    client->setInsecure(); // ข้ามการตรวจสอบ Certificate ทำให้ต่อ Vercel ได้เลย
    
    HTTPClient http;
    http.begin(*client, serverUrl);
    http.addHeader("Content-Type", "application/json");
    
    // สร้าง JSON ง่ายๆ ส่งไปที่เซิร์ฟเวอร์
    String payload = "{\"reactionTime\":" + String(reactionTime, 3) + "}";
    
    int httpResponseCode = http.POST(payload);
    if (httpResponseCode > 0) {
      Serial.print("✅ ส่งเวลาสำเร็จ: ");
      Serial.print(reactionTime);
      Serial.print("s (HTTP Code: ");
      Serial.print(httpResponseCode);
      Serial.println(")");
    } else {
      Serial.print("❌ ส่งเวลาไม่สำเร็จ (HTTP Error: ");
      Serial.print(httpResponseCode);
      Serial.println(")");
    }
    http.end();
    delete client; // คืนค่าหน่วยความจำ
  } else {
    Serial.println("❌ WiFi หลุดการเชื่อมต่อ!");
  }
}

void processReaction(bool isCorrectButton) {
  if (isTiming && isCorrectButton) {
    float reactionTime = (millis() - startTime) / 1000.0; // แปลงเป็นวินาที
    isTiming = false; // หยุดจับเวลา
    Serial.print("⏱️ ตบปุ่มถูกต้อง! เวลา: ");
    Serial.print(reactionTime);
    Serial.println(" วินาที");
    
    // ยิงข้อมูลเข้าเซิร์ฟเวอร์!
    sendReactionTime(reactionTime);
  }
}

void loop() {
  int curBtnRed = digitalRead(btnRedPin);
  int curBtnYellow = digitalRead(btnYellowPin);
  int curBtnGreen = digitalRead(btnGreenPin);
  int curFootSwitch = digitalRead(footSwitchPin);

  // ปุ่ม Override สำหรับตัดการทำงานหน้างาน
  if (lastBtnRed == HIGH && curBtnRed == LOW) {
    Serial.println("\n🛑 [OVERRIDE] กดปุ่ม Red หน้างาน! -> ตัดไฟ Red และล็อคตัวส่ง");
    digitalWrite(relayRedPin, RELAY_OFF);
    processReaction(incomingData.red_on); // เช็คว่าตบถูกตอนไฟแดงติดหรือไม่
    
    myDataToSend.override_red = true; 
    sendOverrideCommand(); 
    myDataToSend.override_red = false;
    delay(200); // Debounce
  }
  
  if (lastBtnYellow == HIGH && curBtnYellow == LOW) {
    Serial.println("\n🛑 [OVERRIDE] กดปุ่ม Yellow หน้างาน! -> ตัดไฟ Yellow และล็อคตัวส่ง");
    digitalWrite(relayYellowPin, RELAY_OFF);
    processReaction(incomingData.yellow_on);
    
    myDataToSend.override_yellow = true; 
    sendOverrideCommand(); 
    myDataToSend.override_yellow = false;
    delay(200);
  }
  
  if (lastBtnGreen == HIGH && curBtnGreen == LOW) {
    Serial.println("\n🛑 [OVERRIDE] กดปุ่ม Green หน้างาน! -> ตัดไฟ Green และล็อคตัวส่ง");
    digitalWrite(relayGreenPin, RELAY_ON);
    processReaction(incomingData.green_on);
    
    myDataToSend.override_green = true; 
    sendOverrideCommand(); 
    myDataToSend.override_green = false;
    delay(200);
  }
  
  if (lastFootSwitch == HIGH && curFootSwitch == LOW) {
    Serial.println("\n🛑 [OVERRIDE] เหยียบ Foot Switch หน้างาน! -> ปิดเสียง (Buzzer) และล็อคตัวส่ง");
    digitalWrite(buzzerPin, BUZZER_OFF);
    processReaction(incomingData.sound_mode && incomingData.sound_enabled);
    
    myDataToSend.override_sound = true; 
    sendOverrideCommand(); 
    myDataToSend.override_sound = false;
    delay(200);
  }
  
  lastBtnRed = curBtnRed; 
  lastBtnYellow = curBtnYellow;
  lastBtnGreen = curBtnGreen; 
  lastFootSwitch = curFootSwitch;
}

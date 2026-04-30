#include <esp_now.h>
#include <WiFi.h>

// 🌐 ตั้งค่า Wi-Fi ให้ตรงกับตัวส่ง
const char* ssid = "IceiPhone";      
const char* password = "Ice22547";   

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

// --- ⏳ ตัวแปรสำหรับกันปุ่มเบิ้ล (Debounce) แก้ปัญหากดหลายรอบ ---
unsigned long lastRedPress = 0;
unsigned long lastYellowPress = 0;
unsigned long lastGreenPress = 0;
unsigned long lastFootPress = 0;
const int debounceDelay = 300; // หน่วงเวลา 300ms เพื่อป้องกันสัญญาณซ้อน

// โครงสร้างข้อมูลที่รับจากตัวส่ง
typedef struct msg_to_rx {
  bool red_on;
  bool yellow_on;
  bool green_on;
  bool sound_mode;
  bool sound_enabled; 
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

// 📡 ฟังก์ชันเมื่อได้รับข้อมูลจากตัวส่ง
void OnDataRecv(const esp_now_recv_info_t * esp_now_info, const uint8_t *incoming, int len) {
  memcpy(&incomingData, incoming, sizeof(incomingData));

  // --- 🛠️ Auto-Pairing ---
  if (!isSenderAdded) {
    memcpy(senderAddress, esp_now_info->src_addr, 6);
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, senderAddress, 6);
    
    // บังคับใช้ Channel ของ Wi-Fi ที่เชื่อมต่ออยู่
    peerInfo.channel = WiFi.channel(); 
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) == ESP_OK) {
      isSenderAdded = true;
      Serial.print("\n✅ [PAIRING] จับคู่สำเร็จ! ใช้ Channel: ");
      Serial.println(peerInfo.channel);
    } else {
      Serial.println("❌ [PAIRING] ไม่สามารถเพิ่มตัวส่งเป็น Peer ได้");
    }
  }

  // --- 🔍 พิมพ์ข้อมูลที่ได้รับจากตัวส่ง ---
  Serial.print("[RX] 📥 Data -> R:"); Serial.print(incomingData.red_on);
  Serial.print(" Y:"); Serial.print(incomingData.yellow_on);
  Serial.print(" G:"); Serial.print(incomingData.green_on);
  Serial.print(" | SndMode:"); Serial.print(incomingData.sound_mode);
  Serial.print(" | SndEn:"); Serial.print(incomingData.sound_enabled);

  // --- ลอจิกการทำงาน ---
  if (incomingData.sound_mode) {
    Serial.print(" >> 🔊 [โหมดเสียง] ");
    digitalWrite(relayRedPin, RELAY_OFF);
    digitalWrite(relayYellowPin, RELAY_OFF);
    digitalWrite(relayGreenPin, RELAY_ON); 

    if (incomingData.sound_enabled) {
      digitalWrite(buzzerPin, BUZZER_ON);
      Serial.print("Buzzer: ON 🎵");
    } else {
      digitalWrite(buzzerPin, BUZZER_OFF);
      Serial.print("Buzzer: OFF 🔇");
    }
  } else {
    Serial.print(" >> 💡 [โหมดไฟ] ");
    digitalWrite(buzzerPin, BUZZER_OFF);
    digitalWrite(relayRedPin, incomingData.red_on ? RELAY_ON : RELAY_OFF);
    digitalWrite(relayYellowPin, incomingData.yellow_on ? RELAY_ON : RELAY_OFF);  
    digitalWrite(relayGreenPin, incomingData.green_on ? RELAY_OFF : RELAY_ON); 

    if(incomingData.red_on) Serial.print("Relay: RED ON 🔴");
    else if(incomingData.yellow_on) Serial.print("Relay: YELLOW ON 🟡");
    else if(incomingData.green_on) Serial.print("Relay: GREEN OFF 🟢"); 
    else Serial.print("Relay: All OFF");
  }
  Serial.println(); 
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

  // 1. 🌐 เชื่อมต่อ Wi-Fi ก่อน
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("\nConnecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("WiFi Channel: ");
  Serial.println(WiFi.channel());

  // 2. เริ่มต้น ESP-NOW
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

void loop() {
  int curBtnRed = digitalRead(btnRedPin);
  int curBtnYellow = digitalRead(btnYellowPin);
  int curBtnGreen = digitalRead(btnGreenPin);
  int curFootSwitch = digitalRead(footSwitchPin);

  // 🔴 ปุ่ม Override Red
  if (lastBtnRed == HIGH && curBtnRed == LOW) {
    if (millis() - lastRedPress > debounceDelay) { 
      Serial.println("\n🛑 [OVERRIDE] กดปุ่ม Red หน้างาน! -> ตัดไฟ Red และล็อคตัวส่ง");
      digitalWrite(relayRedPin, RELAY_OFF);
      myDataToSend.override_red = true;
      sendOverrideCommand();
      myDataToSend.override_red = false;
      lastRedPress = millis(); 
    }
  }
  
  // 🟡 ปุ่ม Override Yellow
  if (lastBtnYellow == HIGH && curBtnYellow == LOW) {
    if (millis() - lastYellowPress > debounceDelay) {
      Serial.println("\n🛑 [OVERRIDE] กดปุ่ม Yellow หน้างาน! -> ตัดไฟ Yellow และล็อคตัวส่ง");
      digitalWrite(relayYellowPin, RELAY_OFF);
      myDataToSend.override_yellow = true;
      sendOverrideCommand();
      myDataToSend.override_yellow = false;
      lastYellowPress = millis();
    }
  }
  
  // 🟢 ปุ่ม Override Green
  if (lastBtnGreen == HIGH && curBtnGreen == LOW) {
    if (millis() - lastGreenPress > debounceDelay) {
      Serial.println("\n🛑 [OVERRIDE] กดปุ่ม Green หน้างาน! -> ตัดไฟ Green และล็อคตัวส่ง");
      digitalWrite(relayGreenPin, RELAY_ON);
      myDataToSend.override_green = true;
      sendOverrideCommand();
      myDataToSend.override_green = false;
      lastGreenPress = millis();
    }
  }
  
  // 🔊 ปุ่ม Override Sound (Foot Switch)
  if (lastFootSwitch == HIGH && curFootSwitch == LOW) {
    if (millis() - lastFootPress > debounceDelay) {
      Serial.println("\n🛑 [OVERRIDE] เหยียบ Foot Switch หน้างาน! -> ปิดเสียง (Buzzer) และล็อคตัวส่ง");
      digitalWrite(buzzerPin, BUZZER_OFF);
      myDataToSend.override_sound = true;
      sendOverrideCommand();
      myDataToSend.override_sound = false;
      lastFootPress = millis();
    }
  }

  // อัปเดตสถานะปุ่มล่าสุด
  lastBtnRed = curBtnRed;
  lastBtnYellow = curBtnYellow;
  lastBtnGreen = curBtnGreen;
  lastFootSwitch = curFootSwitch;
}
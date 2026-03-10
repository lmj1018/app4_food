import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
}

fun readBuildSecret(key: String): String {
    val fromFile = keystoreProperties.getProperty(key)?.trim()
    if (!fromFile.isNullOrEmpty()) return fromFile
    val fromGradle = (project.findProperty(key) as String?)?.trim()
    if (!fromGradle.isNullOrEmpty()) return fromGradle
    val fromEnv = System.getenv(key)?.trim()
    if (!fromEnv.isNullOrEmpty()) return fromEnv
    return ""
}

android {
    namespace = "com.foodpicker.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.foodpicker.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["ADMOB_APP_ID"] = readBuildSecret("ADMOB_APP_ID")
            .ifEmpty { "ca-app-pub-3940256099942544~3347511713" }
    }

    signingConfigs {
        create("release") {
            val storeFilePath = readBuildSecret("KEYSTORE_PATH")
            val storePasswordValue = readBuildSecret("KEYSTORE_PASSWORD")
            val keyAliasValue = readBuildSecret("KEY_ALIAS")
            val keyPasswordValue = readBuildSecret("KEY_PASSWORD")
            if (storeFilePath.isNotEmpty() &&
                storePasswordValue.isNotEmpty() &&
                keyAliasValue.isNotEmpty() &&
                keyPasswordValue.isNotEmpty()
            ) {
                storeFile = file(storeFilePath)
                storePassword = storePasswordValue
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildTypes {
        release {
            val storeFilePath = readBuildSecret("KEYSTORE_PATH")
            val storePasswordValue = readBuildSecret("KEYSTORE_PASSWORD")
            val keyAliasValue = readBuildSecret("KEY_ALIAS")
            val keyPasswordValue = readBuildSecret("KEY_PASSWORD")
            val hasReleaseSigning = storeFilePath.isNotEmpty() &&
                storePasswordValue.isNotEmpty() &&
                keyAliasValue.isNotEmpty() &&
                keyPasswordValue.isNotEmpty()
            if (!hasReleaseSigning) {
                throw GradleException(
                    "Missing release signing config. Provide KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD via android/key.properties, Gradle -P, or environment variables."
                )
            }
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}

#!/usr/bin/env node
/**
 * VibeMoji 배치 멀티플랫폼 배포 자동화
 * 32장 이모티콘 → 카카오톡/라인/Etsy 동시 패키징
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import axios from "axios";

interface EmoticonSet {
  id: string;
  name: string;
  images: string[];
  metadata: {
    author: string;
    description: string;
    keywords: string[];
  };
}

interface PlatformConfig {
  name: string;
  imageSize: { width: number; height: number };
  imageFormat: "png" | "jpg";
  maxCount: number;
  animatedSupport: boolean;
}

const platformConfigs: Record<string, PlatformConfig> = {
  kakao: {
    name: "카카오톡",
    imageSize: { width: 512, height: 512 },
    imageFormat: "png",
    maxCount: 32,
    animatedSupport: false,
  },
  line: {
    name: "라인",
    imageSize: { width: 370, height: 320 },
    imageFormat: "png",
    maxCount: 40,
    animatedSupport: true,
  },
  etsy: {
    name: "Etsy",
    imageSize: { width: 1000, height: 1000 },
    imageFormat: "png",
    maxCount: 50,
    animatedSupport: false,
  },
};

class BatchMultiPlatformDeploy {
  private outputDir: string;

  constructor(outputDir: string = "./deploy-packages") {
    this.outputDir = outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * 이미지를 플랫폼별 규격으로 변환
   */
  async convertImageForPlatform(
    imagePath: string,
    platform: string,
    outputPath: string
  ): Promise<void> {
    const config = platformConfigs[platform];
    if (!config) throw new Error(`지원하지 않는 플랫폼: ${platform}`);

    console.log(`  🖼️  변환: ${imagePath} → ${platform}`);

    let pipeline = sharp(imagePath).withMetadata();

    // 리사이즈
    pipeline = pipeline.resize(config.imageSize.width, config.imageSize.height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    });

    // 포맷 변환
    if (config.imageFormat === "png") {
      pipeline = pipeline.png({ quality: 95 });
    } else {
      pipeline = pipeline.jpeg({ quality: 95 });
    }

    await pipeline.toFile(outputPath);
  }

  /**
   * 플랫폼별 패키지 생성
   */
  async createPlatformPackage(
    emoticonSet: EmoticonSet,
    platform: string
  ): Promise<string> {
    const config = platformConfigs[platform];
    const packageDir = path.join(this.outputDir, platform, emoticonSet.id);

    console.log(`\n📦 ${config.name} 패키지 생성 중...`);

    // 디렉토리 생성
    if (!fs.existsSync(packageDir)) {
      fs.mkdirSync(packageDir, { recursive: true });
    }

    // 이미지 변환 및 복사
    for (let i = 0; i < Math.min(emoticonSet.images.length, config.maxCount); i++) {
      const imagePath = emoticonSet.images[i];
      const fileName = `emoticon_${String(i + 1).padStart(3, "0")}.png`;
      const outputPath = path.join(packageDir, fileName);

      await this.convertImageForPlatform(imagePath, platform, outputPath);
    }

    // 플랫폼별 메타데이터 생성
    this.createPlatformMetadata(emoticonSet, platform, packageDir);

    console.log(`✅ ${config.name} 패키지 완성: ${packageDir}`);
    return packageDir;
  }

  /**
   * 플랫폼별 메타데이터 생성
   */
  private createPlatformMetadata(
    emoticonSet: EmoticonSet,
    platform: string,
    packageDir: string
  ): void {
    const metadataMap: Record<string, object> = {
      kakao: {
        title: emoticonSet.name,
        description: emoticonSet.metadata.description,
        author: emoticonSet.metadata.author,
        tags: emoticonSet.metadata.keywords,
        price: 2200, // 카카오톡 기본 가격
        thumbnail: "emoticon_001.png",
      },
      line: {
        name: emoticonSet.name,
        description: emoticonSet.metadata.description,
        author: emoticonSet.metadata.author,
        tags: emoticonSet.metadata.keywords,
        animated: false,
        customSize: true,
      },
      etsy: {
        title: emoticonSet.name,
        description: emoticonSet.metadata.description,
        seller: emoticonSet.metadata.author,
        tags: emoticonSet.metadata.keywords,
        category: "Digital",
        digitalDelivery: true,
      },
    };

    const metadata = metadataMap[platform];
    const metadataPath = path.join(packageDir, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * 배치 처리: 모든 플랫폼 동시 패키징
   */
  async deployToAllPlatforms(emoticonSet: EmoticonSet): Promise<void> {
    console.log(`\n🚀 ${emoticonSet.name} 배치 배포 시작...`);
    console.log(`총 이미지: ${emoticonSet.images.length}개`);

    const deployResults: Record<string, string> = {};

    for (const platform of Object.keys(platformConfigs)) {
      try {
        const packagePath = await this.createPlatformPackage(emoticonSet, platform);
        deployResults[platform] = packagePath;
      } catch (error) {
        console.error(`❌ ${platform} 배포 실패:`, error);
      }
    }

    // 배포 결과 리포트
    this.generateDeploymentReport(emoticonSet, deployResults);
  }

  /**
   * 배포 결과 리포트 생성
   */
  private generateDeploymentReport(
    emoticonSet: EmoticonSet,
    results: Record<string, string>
  ): void {
    const timestamp = new Date().toISOString();
    const report = `
📋 배포 완료 리포트
${'='.repeat(50)}

세트명: ${emoticonSet.name}
배포 시간: ${timestamp}

배포 결과:
${Object.entries(results)
  .map(([platform, path]) => `  ✅ ${platform.toUpperCase()}: ${path}`)
  .join('\n')}

다음 단계:
1. 각 플랫폼에 수동으로 업로드
2. 메타데이터 검토 및 승인
3. 라이브 배포

생성된 리소스 위치:
${this.outputDir}
`;

    const reportPath = path.join(
      this.outputDir,
      `deployment-report-${Date.now()}.txt`
    );
    fs.writeFileSync(reportPath, report);
    console.log(report);
  }
}

// 테스트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  const deployer = new BatchMultiPlatformDeploy();

  // 테스트 데이터
  const testEmoticonSet: EmoticonSet = {
    id: "vibemoji-001",
    name: "즐거운 하루 이모티콘",
    images: Array.from({ length: 32 }, (_, i) => `./assets/emoticon_${i + 1}.png`),
    metadata: {
      author: "VibeMoji",
      description: "일상의 감정을 표현하는 즐거운 이모티콘 세트",
      keywords: ["감정", "일상", "귀여움", "재미"],
    },
  };

  deployer
    .deployToAllPlatforms(testEmoticonSet)
    .catch((error) => console.error("배포 오류:", error));
}

export { BatchMultiPlatformDeploy, EmoticonSet, PlatformConfig };

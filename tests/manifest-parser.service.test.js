const manifestParser = require('../src/services/manifest-parser.service');

describe('ManifestParserService', () => {
  describe('extract', () => {
    test('ignores non-manifest files', () => {
      const files = [{ path: 'src/App.java', content: 'class App {}' }];
      expect(manifestParser.extract(files)).toEqual([]);
    });

    test('ignores manifest files with no content', () => {
      const files = [{ path: 'pom.xml', content: '' }];
      expect(manifestParser.extract(files)).toEqual([]);
    });

    test('parses pom.xml dependencies with groupId, artifactId, version', () => {
      const content = `
        <project>
          <dependencies>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-starter-web</artifactId>
              <version>3.2.0</version>
            </dependency>
            <dependency>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </dependency>
          </dependencies>
        </project>
      `;
      const result = manifestParser.extract([{ path: 'pom.xml', content }]);
      expect(result).toHaveLength(1);
      expect(result[0].ecosystem).toBe('Maven');
      expect(result[0].dependencies).toContain('org.springframework.boot:spring-boot-starter-web:3.2.0');
      expect(result[0].dependencies).toContain('org.projectlombok:lombok');
    });

    test('parses package.json dependencies and devDependencies', () => {
      const content = JSON.stringify({
        dependencies: { express: '^4.18.2' },
        devDependencies: { jest: '^29.0.0' },
      });
      const result = manifestParser.extract([{ path: 'package.json', content }]);
      expect(result[0].ecosystem).toBe('npm');
      expect(result[0].dependencies).toEqual(expect.arrayContaining(['express@^4.18.2', 'jest@^29.0.0']));
    });

    test('parses requirements.txt lines', () => {
      const content = 'flask==2.3.0\n# a comment\n\nrequests>=2.28.0\n';
      const result = manifestParser.extract([{ path: 'requirements.txt', content }]);
      expect(result[0].ecosystem).toBe('pip');
      expect(result[0].dependencies).toEqual(['flask==2.3.0', 'requests>=2.28.0']);
    });

    test('parses build.gradle implementation dependencies', () => {
      const content = `
        dependencies {
          implementation 'org.springframework.boot:spring-boot-starter-web'
          testImplementation("org.junit.jupiter:junit-jupiter:5.9.0")
        }
      `;
      const result = manifestParser.extract([{ path: 'build.gradle', content }]);
      expect(result[0].ecosystem).toBe('Gradle');
      expect(result[0].dependencies).toEqual(expect.arrayContaining([
        'org.springframework.boot:spring-boot-starter-web',
        'org.junit.jupiter:junit-jupiter:5.9.0',
      ]));
    });

    test('parses go.mod require block', () => {
      const content = `
        module example.com/app

        require (
          github.com/gin-gonic/gin v1.9.1
          github.com/stretchr/testify v1.8.4
        )
      `;
      const result = manifestParser.extract([{ path: 'go.mod', content }]);
      expect(result[0].ecosystem).toBe('Go Modules');
      expect(result[0].dependencies).toEqual(expect.arrayContaining([
        'github.com/gin-gonic/gin@v1.9.1',
        'github.com/stretchr/testify@v1.8.4',
      ]));
    });

    test('parses Cargo.toml dependencies section', () => {
      const content = `
        [package]
        name = "app"

        [dependencies]
        serde = "1.0"
        tokio = "1.28"
      `;
      const result = manifestParser.extract([{ path: 'Cargo.toml', content }]);
      expect(result[0].ecosystem).toBe('Cargo');
      expect(result[0].dependencies).toEqual(expect.arrayContaining(['serde@1.0', 'tokio@1.28']));
    });

    test('does not throw on malformed package.json', () => {
      const files = [{ path: 'package.json', content: '{ not valid json' }];
      expect(() => manifestParser.extract(files)).not.toThrow();
      expect(manifestParser.extract(files)).toEqual([]);
    });
  });
});

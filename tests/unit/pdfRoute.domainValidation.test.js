/**
 * PDF Route - 노션 도메인 검증 테스트
 * 
 * 테스트 대상: validateNotionDomain() 함수
 * 기능: 노션의 공식 도메인(notion.so, notion.site)만 허용하는지 검증
 * 
 * 테스트 전략:
 * 1. 기본 허용/거절 케이스
 * 2. Subdomain 다양한 패턴
 * 3. URL 파싱 에러
 * 4. 보안 우회 시도
 * 5. 엣지 케이스
 */

describe('PDF Route - 노션 도메인 검증 (validateNotionDomain)', () => {
    let validateNotionDomain;

    beforeAll(() => {
        validateNotionDomain = (url) => {
            try {
                const urlObj = new URL(url);
                const validDomains = ['notion.so', 'notion.site'];
                
                const isValidDomain = validDomains.some(domain => 
                    urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
                );
                
                if (!isValidDomain) {
                    return { valid: false, error: '허용되지 않는 도메인입니다. notion.so 또는 notion.site 도메인만 사용 가능합니다.' };
                }
                return { valid: true };
            } catch (err) {
                return { valid: false, error: '유효하지 않은 URL 형식입니다.' };
            }
        };
    });

    // ================================================================
    // PART 1: 정확한 도메인 매핑 (허용)
    // ================================================================
    describe('PART 1: 정확한 공식 도메인', () => {
        test('notion.so만 입력하면 허용', () => {
            const result = validateNotionDomain('https://notion.so/page');
            expect(result.valid).toBe(true);
        });

        test('notion.site만 입력하면 허용', () => {
            const result = validateNotionDomain('https://notion.site/page');
            expect(result.valid).toBe(true);
        });

        test('notion.so + /만 있어도 허용', () => {
            const result = validateNotionDomain('https://notion.so/');
            expect(result.valid).toBe(true);
        });

        test('notion.site + /만 있어도 허용', () => {
            const result = validateNotionDomain('https://notion.site/');
            expect(result.valid).toBe(true);
        });
    });

    // ================================================================
    // PART 2: Subdomain 다양한 패턴 (허용)
    // ================================================================
    describe('PART 2: Subdomain 패턴들 (모두 허용)', () => {
        test('www.notion.so는 허용', () => {
            const result = validateNotionDomain('https://www.notion.so/page');
            expect(result.valid).toBe(true);
        });

        test('www.notion.site는 허용', () => {
            const result = validateNotionDomain('https://www.notion.site/page');
            expect(result.valid).toBe(true);
        });

        test('api.notion.so는 허용', () => {
            const result = validateNotionDomain('https://api.notion.so/page');
            expect(result.valid).toBe(true);
        });

        test('custom.notion.site는 허용', () => {
            const result = validateNotionDomain('https://custom.notion.site/page');
            expect(result.valid).toBe(true);
        });

        test('cloudier.notion.site는 허용', () => {
            const result = validateNotionDomain('https://cloudier.notion.site/page');
            expect(result.valid).toBe(true);
        });

        test('user-123.notion.so는 허용 (하이픈 포함)', () => {
            const result = validateNotionDomain('https://user-123.notion.so/page');
            expect(result.valid).toBe(true);
        });

        test('api.v1.notion.site는 허용 (깊은 subdomain)', () => {
            const result = validateNotionDomain('https://api.v1.notion.site/page');
            expect(result.valid).toBe(true);
        });

        test('a.b.c.d.e.notion.so는 허용 (매우 깊음)', () => {
            const result = validateNotionDomain('https://a.b.c.d.e.notion.so/page');
            expect(result.valid).toBe(true);
        });
    });

    // ================================================================
    // PART 3: 도메인 거절 케이스
    // ================================================================
    describe('PART 3: 거절되어야 할 도메인들', () => {
        test('notion.com은 거절 (잘못된 TLD)', () => {
            const result = validateNotionDomain('https://notion.com/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('notion.co.uk는 거절 (다른 도메인)', () => {
            const result = validateNotionDomain('https://notion.co.uk/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('notion.ite는 거절 (사용자 오입력)', () => {
            const result = validateNotionDomain('https://notion.ite/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('cloudier338.notion.ite는 거절 (잘못된 TLD)', () => {
            const result = validateNotionDomain('https://cloudier338.notion.ite/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('my-notion.so는 거절 (도메인 변조)', () => {
            const result = validateNotionDomain('https://my-notion.so/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('fake-notion.site는 거절 (도메인 변조)', () => {
            const result = validateNotionDomain('https://fake-notion.site/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });
    });

    // ================================================================
    // PART 4: URL 파싱 실패 케이스
    // ================================================================
    describe('PART 4: URL 파싱 실패 케이스들', () => {
        test('프로토콜 없는 URL은 거절', () => {
            const result = validateNotionDomain('notion.so/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('공백이 있는 URL은 거절', () => {
            const result = validateNotionDomain('https://notion so/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('빈 문자열은 거절', () => {
            const result = validateNotionDomain('');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('null은 거절', () => {
            const result = validateNotionDomain(null);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('undefined는 거절', () => {
            const result = validateNotionDomain(undefined);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('중괄호만 있는 URL은 거절', () => {
            const result = validateNotionDomain('{}');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('대괄호만 있는 URL은 거절', () => {
            const result = validateNotionDomain('[]');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });
    });

    // ================================================================
    // PART 5: 보안 우회 시도 (모두 거절)
    // ================================================================
    describe('PART 5: 보안 우회 시도들', () => {
        test('notion.so.com은 거절 (도메인 붙여넣기)', () => {
            const result = validateNotionDomain('https://notion.so.com/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('notion.site.net은 거절 (도메인 변조)', () => {
            const result = validateNotionDomain('https://notion.site.net/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('www.notion.so.com은 거절 (Subdomain + 도메인 붙여넣기)', () => {
            const result = validateNotionDomain('https://www.notion.so.com/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('not-notion.so는 거절 (하이픈으로 변조)', () => {
            const result = validateNotionDomain('https://not-notion.so/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('localhost는 거절 (로컬 주소)', () => {
            const result = validateNotionDomain('http://localhost:3000');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('127.0.0.1은 거절 (IP 주소)', () => {
            const result = validateNotionDomain('http://127.0.0.1:3000');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('192.168.1.1은 거절 (프라이빗 IP)', () => {
            const result = validateNotionDomain('http://192.168.1.1/page');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });
    });

    // ================================================================
    // PART 6: 경계값 및 엣지 케이스
    // ================================================================
    describe('PART 6: 경계값 및 엣지 케이스', () => {
        test('포트가 있는 notion.so는 허용', () => {
            const result = validateNotionDomain('https://notion.so:443/page');
            expect(result.valid).toBe(true);
        });

        test('커스텀 포트가 있는 notion.site는 허용', () => {
            const result = validateNotionDomain('https://notion.site:8080/page');
            expect(result.valid).toBe(true);
        });

        test('query parameter가 있는 notion.so는 허용', () => {
            const result = validateNotionDomain('https://notion.so/page?id=123&type=doc');
            expect(result.valid).toBe(true);
        });

        test('fragment가 있는 notion.site는 허용', () => {
            const result = validateNotionDomain('https://notion.site/page#section');
            expect(result.valid).toBe(true);
        });

        test('query와 fragment가 모두 있는 URL은 허용', () => {
            const result = validateNotionDomain('https://www.notion.so/page?id=1#top');
            expect(result.valid).toBe(true);
        });

        test('대문자가 포함된 NOTION.SO는 허용 (대소문자 무시)', () => {
            const result = validateNotionDomain('https://NOTION.SO/page');
            expect(result.valid).toBe(true);
        });

        test('섞인 표기 WWW.Notion.Site는 허용', () => {
            const result = validateNotionDomain('https://WWW.Notion.Site/page');
            expect(result.valid).toBe(true);
        });

        test('특수문자가 없는 긴 경로는 허용', () => {
            const result = validateNotionDomain('https://notion.so/very/very/very/long/path/here');
            expect(result.valid).toBe(true);
        });

        test('URL인코딩된 경로는 허용', () => {
            const result = validateNotionDomain('https://notion.so/page%20name%20here');
            expect(result.valid).toBe(true);
        });

        test('한글이 포함된 경로는 허용', () => {
            const result = validateNotionDomain('https://notion.site/%ED%85%8C%EC%8A%A4%ED%8A%B8');
            expect(result.valid).toBe(true);
        });
    });

    // ================================================================
    // PART 7: 숫자가 포함된 Subdomain
    // ================================================================
    describe('PART 7: 숫자 포함 Subdomain (모두 허용)', () => {
        test('api1.notion.so는 허용', () => {
            const result = validateNotionDomain('https://api1.notion.so/page');
            expect(result.valid).toBe(true);
        });

        test('v2.notion.site는 허용', () => {
            const result = validateNotionDomain('https://v2.notion.site/page');
            expect(result.valid).toBe(true);
        });

        test('123.notion.so는 허용', () => {
            const result = validateNotionDomain('https://123.notion.so/page');
            expect(result.valid).toBe(true);
        });

        test('test-123-abc.notion.site는 허용', () => {
            const result = validateNotionDomain('https://test-123-abc.notion.site/page');
            expect(result.valid).toBe(true);
        });
    });

    // ================================================================
    // PART 8: 에러 메시지 일관성
    // ================================================================
    describe('PART 8: 에러 메시지 일관성', () => {
        test('도메인 거절시 정확한 에러 메시지 반환', () => {
            const result = validateNotionDomain('https://example.com/page');
            expect(result.error).toBe('허용되지 않는 도메인입니다. notion.so 또는 notion.site 도메인만 사용 가능합니다.');
        });

        test('URL 파싱 실패시 정확한 에러 메시지 반환', () => {
            const result = validateNotionDomain('invalid url');
            expect(result.error).toBe('유효하지 않은 URL 형식입니다.');
        });

        test('모든 거절 케이스에서 valid가 false', () => {
            const invalidUrls = [
                'https://example.com/page',
                'https://notion.com/page',
                'invalid',
                ''
            ];
            
            invalidUrls.forEach(url => {
                const result = validateNotionDomain(url);
                expect(result.valid).toBe(false);
            });
        });

        test('모든 허용 케이스에서 valid가 true', () => {
            const validUrls = [
                'https://notion.so/page',
                'https://notion.site/page',
                'https://www.notion.so/page',
                'https://api.notion.site/page'
            ];
            
            validUrls.forEach(url => {
                const result = validateNotionDomain(url);
                expect(result.valid).toBe(true);
            });
        });
    });



    describe('✅ 허용되어야 할 노션 URL', () => {
        test('기본 notion.so 도메인을 허용해야 함', () => {
            // Arrange
            const url = 'https://notion.so/page-id';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('기본 notion.site 도메인을 허용해야 함', () => {
            // Arrange
            const url = 'https://notion.site/mypage';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('www subdomain이 있는 notion.so URL을 허용해야 함', () => {
            // Arrange
            const url = 'https://www.notion.so/docs/page-id';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('www subdomain이 있는 notion.site URL을 허용해야 함', () => {
            // Arrange
            const url = 'https://www.notion.site/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('custom subdomain이 있는 notion.so URL을 허용해야 함', () => {
            // Arrange
            const url = 'https://api.notion.so/database/xyz';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('cloudier.notion.site 형태의 subdomain을 허용해야 함', () => {
            // Arrange
            const url = 'https://cloudier.notion.site/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('여러 단계의 subdomain이 있는 notion.site URL을 허용해야 함', () => {
            // Arrange
            const url = 'https://api.v1.notion.site/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('query parameter가 있는 notion.so URL을 허용해야 함', () => {
            // Arrange
            const url = 'https://notion.so/page?param=value&id=123';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('fragment가 있는 notion.site URL을 허용해야 함', () => {
            // Arrange
            const url = 'https://notion.site/page#section';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });
    });

    describe('❌ 거절되어야 할 URL', () => {
        test('notion.com 도메인을 거절해야 함', () => {
            // Arrange
            const url = 'https://notion.com/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('잘못된 TLD인 notion.ite를 거절해야 함', () => {
            // Arrange
            const url = 'https://notion.ite/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('fake-notion.so 형태의 URL을 거절해야 함', () => {
            // Arrange
            const url = 'https://fake-notion.so/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('cloudier338.notion.ite를 거절해야 함', () => {
            // Arrange
            const url = 'https://cloudier338.notion.ite/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('localhost를 거절해야 함', () => {
            // Arrange
            const url = 'http://localhost:3000/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('IP 주소를 거절해야 함', () => {
            // Arrange
            const url = 'http://192.168.1.1/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });
    });

    describe('⚠️ 유효하지 않은 URL 형식', () => {
        test('프로토콜 없는 URL을 거절해야 함', () => {
            // Arrange
            const url = 'notion.so/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('공백이 포함된 URL을 거절해야 함', () => {
            // Arrange
            const url = 'https://notion so/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('빈 문자열을 거절해야 함', () => {
            // Arrange
            const url = '';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });

        test('null을 거절해야 함', () => {
            // Arrange
            const url = null;

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('유효하지 않은 URL 형식');
        });
    });

    describe('🔒 보안 관련 테스트', () => {
        test('subdomain을 이용한 우회 시도: notion.so.com을 차단해야 함', () => {
            // Arrange
            const url = 'https://notion.so.com/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('notion-like 도메인 공격을 차단해야 함', () => {
            // Arrange
            const url = 'https://not-notion.so/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(false);
            expect(result.error).toContain('허용되지 않는 도메인');
        });

        test('포트를 포함한 URL을 정상 처리해야 함', () => {
            // Arrange
            const url = 'https://www.notion.so:443/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });
    });

    describe('📋 엣지 케이스', () => {
        test('매우 깊은 subdomain을 허용해야 함', () => {
            // Arrange
            const url = 'https://a.b.c.d.e.f.notion.so/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('대문자가 포함된 도메인을 허용해야 함', () => {
            // Arrange
            const url = 'https://WWW.NOTION.SO/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('숫자가 포함된 subdomain을 허용해야 함', () => {
            // Arrange
            const url = 'https://api1.notion.site/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });

        test('하이픈이 포함된 subdomain을 허용해야 함', () => {
            // Arrange
            const url = 'https://my-api.notion.so/page';

            // Act
            const result = validateNotionDomain(url);

            // Assert
            expect(result.valid).toBe(true);
        });
    });
});
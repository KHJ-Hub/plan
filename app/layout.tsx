import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '배정고 수강설계 점검표',
  description: '학생의 신청안과 학교 공식 수강신청 결과를 진로·희망학과 기준으로 함께 확인합니다.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}

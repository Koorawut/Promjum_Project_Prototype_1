"use client";

import Link from "next/link";
import Icon from "@/components/icon";
import { useAuthStore } from "@/store/auth";

export default function HomePage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="container narrow" style={{ maxWidth: "880px" }}>
      <div className="hello" data-od-id="home-hello">
        <div>
          <p className="eyebrow">สวัสดี{user ? `, ${user.username}` : ""}</p>
          <h1>วันนี้อยากทำอะไรดี?</h1>
        </div>
      </div>

      <div className="cats" role="group" aria-label="เลือกกิจกรรม" style={{ marginTop: "24px" }}>
        <Link className="choice" href="/practice/select" data-od-id="home-go-practice">
          <span className="choice-body">
            <span className="cat-icon cat-daily">
              <Icon name="book" className="icon icon-lg" />
            </span>
            <span className="cat-name">
              ฝึกพูด
              <span className="cat-en">ฝึกประโยคทีละหมวด พร้อม Quiz</span>
            </span>
            <span className="choice-tick">
              <Icon name="arrow-right" />
            </span>
          </span>
        </Link>

        <Link className="choice" href="/game/lobby" data-od-id="home-go-game">
          <span className="choice-body">
            <span className="cat-icon cat-sun">
              <Icon name="game" className="icon icon-lg" />
            </span>
            <span className="cat-name">
              เล่นมินิเกม
              <span className="cat-en">จับคู่กับเพื่อนสด พูดอธิบาย ให้เพื่อนทาย</span>
            </span>
            <span className="choice-tick">
              <Icon name="arrow-right" />
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}

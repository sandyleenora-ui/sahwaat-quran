/* ============================================================================
   صحوة — تاب «حلقتي» (تجربة محدودة: معلّمة واحدة + ٥ طالبات)

   الملف ده مضاف فوق الموقع الأصلي من غير ما يغيّر أي حاجة في أدوات الحفظ
   والمتشابهات. لو الربط مش متظبط، التاب بيقول كده بالعربي والموقع بيفضل
   شغّال زي ما هو.

   الحماية الحقيقية مش هنا — هي في RLS جوّه قاعدة البيانات (schema.sql).
   الزراير اللي بتتخفي هنا للراحة بس؛ لو حد حاول يتحايل، السيرفر بيرفض.
   ========================================================================== */
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const V = document.getElementById("v-halaqa");
const B = () => window.SAHWA;                       // جسر لدوال الموقع الأصلي
const CFG = window.SAHWA_CFG || {};
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ar = n => B() && B().ar ? B().ar(n) : String(n);
const SU = n => (B() && B().SU ? B().SU[n] : "") || ("سورة " + n);
const toast = (m, bad) => B() && B().toast ? B().toast(m, bad) : alert(m);
const KIND = { hifz: "حفظ", review: "مراجعة" };

let sb = null, ME = null, CIRCLE = null, RECOVER = false, BUSY = false;

/* --------------------------------------------------------------- أدوات --- */
const todayISO = () => new Date().toISOString().slice(0, 10);
/* التاريخ ممكن يرجع نص أو كائن تاريخ حسب الدرايفر — نوحّده قبل أي مقارنة */
const isoOf = d => !d ? "" : (d instanceof Date ? d.toISOString().slice(0, 10)
                                                : String(d).slice(0, 10));
const dateAr = d => {
  const p = isoOf(d).split("-");
  return p.length === 3 ? ar(+p[2]) + "/" + ar(+p[1]) : "";
};
const live = c => !!c && c.active && (!c.ends_on || isoOf(c.ends_on) >= todayISO());
const val = id => (document.getElementById(id) || {}).value || "";

/* الأخطاء اللي بترجع من السيرفر — نقولها بالعربي بدل الإنجليزي */
function why(e) {
  const m = (e && (e.message || e.error_description || "")) + "";
  if (/row-level security|violates row-level/i.test(m))
    return "السيرفر رفض العملية دي. غالبًا خدمة الحلقة موقوفة، أو مالكش صلاحية عليها.";
  if (/غير مسموح/.test(m)) return m;
  if (/Invalid login credentials/i.test(m)) return "الإيميل أو كلمة السر غلط.";
  if (/Email not confirmed/i.test(m)) return "الحساب لسه محتاج تأكيد الإيميل.";
  if (/duplicate key/i.test(m)) return "ده متسجّل قبل كده.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "مفيش نت، أو الرابط غلط.";
  return m || "حصل خطأ.";
}
async function run(fn, okMsg) {
  if (BUSY) return;
  BUSY = true;
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(why(e), true); }
  finally { BUSY = false; await paint(); }
}
const must = r => { if (r.error) throw r.error; return r.data; };

/* ------------------------------------------------------------ التحميل --- */
async function loadAll() {
  ME = null; CIRCLE = null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  ME = must(await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle());
  if (!ME) return;
  const cs = must(await sb.from("circles").select("*").order("created_at"));
  CIRCLE = cs[0] || null;
}

async function myAssignments() {
  return must(await sb.from("assignments")
    .select("*, submissions(student_id,done_at), evaluations(student_id,score,note)")
    .order("due_on", { ascending: false }));
}
async function circleStudents() {
  const ms = must(await sb.from("circle_members")
    .select("student_id, profiles!circle_members_student_id_fkey(id,full_name,email)")
    .eq("circle_id", CIRCLE.id));
  return ms.map(m => m.profiles).filter(Boolean);
}

/* =========================================================== الواجهات === */

function loginHTML(msg) {
  return '<h2 class="sec">حلقتي</h2>'
    + (msg ? '<div class="hq-bad">' + esc(msg) + "</div>" : "")
    + '<div class="card" style="margin-bottom:16px">'
    + '<div class="hq-note" style="margin-bottom:11px">'
    + "ادخلي بالإيميل وكلمة السر اللي اتعملوا لك. التاب ده للحلقة بس — "
    + "باقي أدوات الموقع شغالة من غير تسجيل دخول.</div>"
    + '<div class="hq-f" style="margin-bottom:8px"><label for="hqEmail">الإيميل</label>'
    + '<input class="wfld" id="hqEmail" type="email" autocomplete="username" inputmode="email"></div>'
    + '<div class="hq-f" style="margin-bottom:11px"><label for="hqPass">كلمة السر</label>'
    + '<input class="wfld" id="hqPass" type="password" autocomplete="current-password"></div>'
    + '<div class="hq-row"><button class="btn" type="button" id="hqIn">دخول</button>'
    + '<button class="btn ghost" type="button" id="hqForgot">نسيت كلمة السر</button></div></div>';
}

function recoverHTML() {
  return '<h2 class="sec">كلمة سر جديدة</h2><div class="card">'
    + '<div class="hq-note" style="margin-bottom:11px">اكتبي كلمة سر جديدة للحساب ده.</div>'
    + '<div class="hq-f" style="margin-bottom:11px"><label for="hqNew">كلمة السر الجديدة</label>'
    + '<input class="wfld" id="hqNew" type="password" autocomplete="new-password"></div>'
    + '<button class="btn" type="button" id="hqSetPass">احفظي</button></div>';
}

function headHTML() {
  const role = { owner: "مالكة", teacher: "معلّمة", student: "طالبة" }[ME.role] || ME.role;
  return '<div class="hq-who"><b>' + esc(ME.full_name || ME.email) + "</b>"
    + '<span class="hq-tag">' + role + "</span>"
    + (CIRCLE ? '<span class="hq-tag">' + esc(CIRCLE.name) + "</span>" : "")
    + '<button class="btn ghost" type="button" id="hqOut" style="margin-inline-start:auto">خروج</button></div>'
    + (CIRCLE && !live(CIRCLE)
        ? '<div class="hq-bad">خدمة الحلقة موقوفة دلوقتي'
          + (CIRCLE.ends_on && isoOf(CIRCLE.ends_on) < todayISO()
              ? " — مدة التجربة خلصت يوم " + dateAr(CIRCLE.ends_on) : "")
          + ". تقدري تشوفي سجلك، لكن مفيش واجبات ولا تقييم جديد لحد ما ترجع."
          + "<br>أدوات الحفظ والمتشابهات وباقي الموقع شغالة عادي.</div>"
        : "");
}

/* ------------------------------------------------------------- الطالبة --- */
function studentHTML(list) {
  const mine = list.map(a => {
    const sub = (a.submissions || []).find(s => s.student_id === ME.id);
    const ev = (a.evaluations || []).find(s => s.student_id === ME.id);
    return { a, sub, ev };
  });
  return headHTML()
    + '<div class="hq-ok">المعلّمة بتشوف إنك أنهيتي التدريب، وبتشوف تقييمها ليكي. '
    + "ملاحظاتك الشخصية وتسجيلاتك الصوتية على جهازك وما بتترفعش.</div>"
    + '<h2 class="sec">واجباتي</h2>'
    + (mine.length ? mine.map(({ a, sub, ev }) =>
        '<div class="hq-card"><h3>' + esc(SU(a.surah)) + " — من آية " + ar(a.from_ayah)
        + " لآية " + ar(a.to_ayah) + "</h3>"
        + '<div class="hq-meta"><span>' + (KIND[a.kind] || a.kind) + "</span>"
        + "<span>موعدها " + dateAr(a.due_on) + "</span>"
        + (sub ? '<span style="color:var(--ok)">أنهيتي التدريب</span>'
               : "<span>لسه ما أنهيتيش</span>") + "</div>"
        + (a.note ? '<div class="hq-note">' + esc(a.note) + "</div>" : "")
        + (ev ? '<div class="hq-note"><b>تقييم المعلّمة:</b> ' + ar(ev.score) + " من ٥"
                + (ev.note ? " — " + esc(ev.note) : "") + "</div>" : "")
        + '<div class="hq-row"><button class="btn ghost" type="button" data-hqopen="'
        + a.id + '">افتحيها في حفظ</button>'
        + (sub ? "" : '<button class="btn" type="button" data-hqdone="' + a.id
                      + '">أنهيت التدريب</button>')
        + "</div></div>").join("")
      : '<div class="vempty">مفيش واجبات لسه.</div>')
    + '<h2 class="sec">بياناتي</h2><div class="card">'
    + '<div class="hq-note" style="margin-bottom:10px">تقدري تنزّلي نسخة من '
    + "واجباتك وحالتها وتقييماتك في ملف واحد.</div>"
    + '<button class="btn ghost" type="button" id="hqExport">نزّلي بياناتي</button></div>';
}

/* ------------------------------------------------------------ المعلّمة --- */
function teacherHTML(list, studs) {
  const on = live(CIRCLE);
  const opts = [];
  for (let n = 1; n <= 114; n++) opts.push('<option value="' + n + '">' + ar(n) + ". " + esc(SU(n)) + "</option>");
  return headHTML()
    + '<h2 class="sec">واجب جديد</h2><div class="card" style="margin-bottom:16px">'
    + (on ? "" : '<div class="hq-note" style="margin-bottom:9px">الحلقة موقوفة — مش هينفع تضيفي واجب دلوقتي.</div>')
    + '<div class="hq-f" style="margin-bottom:9px"><label for="hqSur">السورة</label>'
    + '<select class="wfld" id="hqSur">' + opts.join("") + "</select></div>"
    + '<div class="hq-grid" style="margin-bottom:9px">'
    + '<div class="hq-f"><label for="hqFrom">من آية</label>'
    + '<input class="wfld" id="hqFrom" type="number" min="1" value="1"></div>'
    + '<div class="hq-f"><label for="hqTo">لآية</label>'
    + '<input class="wfld" id="hqTo" type="number" min="1" value="5"></div>'
    + '<div class="hq-f"><label for="hqKind">النوع</label>'
    + '<select class="wfld" id="hqKind"><option value="hifz">حفظ</option>'
    + '<option value="review">مراجعة</option></select></div>'
    + '<div class="hq-f"><label for="hqDue">التاريخ</label>'
    + '<input class="wfld" id="hqDue" type="date" value="' + todayISO() + '"></div></div>'
    + '<div class="hq-f" style="margin-bottom:10px"><label for="hqNote">ملاحظة (اختياري)</label>'
    + '<input class="wfld" id="hqNote" type="text"></div>'
    + '<div class="hq-note" style="margin-bottom:9px">هيتسند لكل طالبات الحلقة ('
    + ar(studs.length) + ").</div>"
    + '<button class="btn" type="button" id="hqAdd"' + (on ? "" : " disabled") + ">ضيفي الواجب</button></div>"
    + '<h2 class="sec">الواجبات ومين خلصت</h2>'
    + (list.length ? list.map(a => {
        const subs = a.submissions || [], evs = a.evaluations || [];
        return '<div class="hq-card"><h3>' + esc(SU(a.surah)) + " — من آية " + ar(a.from_ayah)
          + " لآية " + ar(a.to_ayah) + "</h3>"
          + '<div class="hq-meta"><span>' + (KIND[a.kind] || a.kind) + "</span>"
          + "<span>موعدها " + dateAr(a.due_on) + "</span>"
          + "<span>أنهت " + ar(subs.length) + " من " + ar(studs.length) + "</span></div>"
          + studs.map(s => {
              const done = subs.some(x => x.student_id === s.id);
              const ev = evs.find(x => x.student_id === s.id);
              return '<div class="hq-st"><b>' + esc(s.full_name || s.email) + "</b>"
                + (done ? '<span class="hq-done">أنهت التدريب</span>'
                        : '<span class="hq-wait">لسه</span>')
                + '<span class="hq-score">' + [1, 2, 3, 4, 5].map(n =>
                    '<button type="button" data-hqev="' + a.id + "|" + s.id + "|" + n
                    + '" aria-pressed="' + String(!!ev && ev.score === n) + '"'
                    + (on ? "" : " disabled") + ">" + ar(n) + "</button>").join("") + "</span>"
                + '<button class="btn ghost" type="button" data-hqevn="' + a.id + "|" + s.id
                + '"' + (on ? "" : " disabled") + ">ملاحظة</button>"
                + (ev && ev.note ? '<div class="hq-note" style="flex-basis:100%">'
                                   + esc(ev.note) + "</div>" : "")
                + "</div>";
            }).join("")
          + '<div class="hq-note">«أنهت التدريب» دي الطالبة هي اللي بتسجلها. '
          + "التقييم من ١ لـ ٥ ده بتاعك إنتي.</div></div>";
      }).join("")
      : '<div class="vempty">لسه ما عملتيش واجبات.</div>');
}

/* ------------------------------------------------------------- المالكة --- */
function ownerHTML(profs) {
  const on = live(CIRCLE);
  return headHTML()
    + '<h2 class="sec">حالة التجربة</h2><div class="card" style="margin-bottom:16px">'
    + (CIRCLE
        ? '<div class="hq-note" style="margin-bottom:10px">الحلقة «' + esc(CIRCLE.name)
          + "» " + (on ? "شغالة" : "موقوفة")
          + (CIRCLE.ends_on ? " · التجربة لحد " + dateAr(CIRCLE.ends_on) : "") + ".</div>"
          + '<div class="hq-row"><button class="btn" type="button" id="hqToggle">'
          + (on ? "وقّفي الخدمة" : "رجّعي الخدمة") + "</button>"
          + '<input class="wfld" id="hqEnds" type="date" value="'
          + isoOf(CIRCLE.ends_on) + '" style="width:160px">'
          + '<button class="btn ghost" type="button" id="hqEndsSave">احفظي التاريخ</button></div>'
        : '<div class="hq-note">لسه مفيش حلقة. اعمليها من SQL Editor زي ما مكتوب في ملف الإعداد.</div>')
    + "</div>"
    + '<h2 class="sec">الحسابات</h2>'
    + '<div class="hq-note" style="margin-bottom:10px">الحسابات بتتعمل من لوحة Supabase، '
    + "وبعدين تحدّدي هنا دور كل واحدة ومين في الحلقة.</div>"
    + profs.map(p => '<div class="hq-st"><b>' + esc(p.full_name || p.email) + "<br>"
        + '<span class="hq-wait">' + esc(p.email || "") + "</span></b>"
        + '<select class="wfld" data-hqrole="' + p.id + '" style="width:110px">'
        + ["student", "teacher", "owner"].map(r => '<option value="' + r + '"'
            + (p.role === r ? " selected" : "") + ">"
            + { student: "طالبة", teacher: "معلّمة", owner: "مالكة" }[r] + "</option>").join("")
        + "</select>"
        + (CIRCLE ? '<button class="btn ghost" type="button" data-hqmem="' + p.id + "|"
                    + (p.inCircle ? "0" : "1") + '">'
                    + (p.inCircle ? "شيليها من الحلقة" : "ضيفيها للحلقة") + "</button>" : "")
        + "</div>").join("");
}

/* ============================================================== الرسم === */
async function paint(msg) {
  if (!V) return;
  if (!sb) {
    V.innerHTML = '<h2 class="sec">حلقتي</h2><div class="card"><div class="hq-note">'
      + "<b>خدمة الحلقة لسه ما فتحتش.</b><br>"
      + "هنا هتلاقي واجباتك من المعلّمة، وتعلّمي إنك خلّصتي تدريبك، "
      + "وتشوفي تقييمها ليكي."
      + "<br><br>لحد ما تفتح، أدوات الحفظ والمتشابهات وباقي الموقع "
      + "شغالة عادي زي ما هي.</div></div>";
    return;
  }
  if (RECOVER) { V.innerHTML = recoverHTML(); return; }
  try {
    await loadAll();
    if (!ME) { V.innerHTML = loginHTML(msg); return; }
    if (ME.role === "student") {
      V.innerHTML = studentHTML(await myAssignments());
    } else if (ME.role === "teacher") {
      if (!CIRCLE) { V.innerHTML = headHTML() + '<div class="vempty">مفيش حلقة متسندة لك.</div>'; return; }
      V.innerHTML = teacherHTML(await myAssignments(), await circleStudents());
    } else {
      const profs = must(await sb.from("profiles").select("*").order("role"));
      let mem = [];
      if (CIRCLE) mem = must(await sb.from("circle_members").select("student_id").eq("circle_id", CIRCLE.id));
      profs.forEach(p => { p.inCircle = mem.some(m => m.student_id === p.id); });
      V.innerHTML = ownerHTML(profs);
    }
  } catch (e) {
    V.innerHTML = '<h2 class="sec">حلقتي</h2><div class="hq-bad">' + esc(why(e)) + "</div>"
      + '<button class="btn ghost" type="button" id="hqOut">خروج</button>';
  }
}

/* ============================================================ الدوسات === */
V && V.addEventListener("click", async e => {
  const t = e.target;
  const hit = s => t.closest(s);

  if (hit("#hqIn")) return run(async () => {
    const r = await sb.auth.signInWithPassword({ email: val("hqEmail").trim(), password: val("hqPass") });
    if (r.error) throw r.error;
  }, "أهلًا بيكي 🌿");

  if (hit("#hqForgot")) {
    const em = val("hqEmail").trim();
    if (!em) { toast("اكتبي الإيميل الأول.", true); return; }
    return run(async () => {
      const r = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.href });
      if (r.error) throw r.error;
    }, "بعتنا لك رسالة على الإيميل.");
  }

  if (hit("#hqSetPass")) return run(async () => {
    const r = await sb.auth.updateUser({ password: val("hqNew") });
    if (r.error) throw r.error;
    RECOVER = false;
  }, "اتغيّرت كلمة السر ✓");

  if (hit("#hqOut")) return run(async () => { await sb.auth.signOut(); RECOVER = false; });

  /* ---- الطالبة ---- */
  const op = hit("[data-hqopen]");
  if (op) {
    const a = (await myAssignments()).find(x => x.id === op.dataset.hqopen);
    if (a) openInMemo(a);
    return;
  }
  const dn = hit("[data-hqdone]");
  if (dn) return run(async () => {
    const r = await sb.from("submissions")
      .upsert({ assignment_id: dn.dataset.hqdone, student_id: ME.id },
              { onConflict: "assignment_id,student_id" });
    if (r.error) throw r.error;
  }, "تمام، سجّلنا إنك أنهيتي التدريب ✓");

  if (hit("#hqExport")) return exportMine();

  /* ---- المعلّمة ---- */
  if (hit("#hqAdd")) return run(async () => {
    const studs = await circleStudents();
    const a = must(await sb.from("assignments").insert({
      circle_id: CIRCLE.id, surah: +val("hqSur"),
      from_ayah: +val("hqFrom"), to_ayah: +val("hqTo"),
      kind: val("hqKind"), due_on: val("hqDue") || todayISO(),
      note: val("hqNote") || null, created_by: ME.id
    }).select().single());
    if (studs.length) {
      const r = await sb.from("assignment_students")
        .insert(studs.map(s => ({ assignment_id: a.id, student_id: s.id })));
      if (r.error) throw r.error;
    }
  }, "اتضاف الواجب ✓");

  const ev = hit("[data-hqev]");
  if (ev) {
    const [aid, sid, n] = ev.dataset.hqev.split("|");
    return run(async () => {
      const r = await sb.from("evaluations").upsert(
        { assignment_id: aid, student_id: sid, score: +n, teacher_id: ME.id },
        { onConflict: "assignment_id,student_id" });
      if (r.error) throw r.error;
    }, "اتسجّل التقييم ✓");
  }
  const evn = hit("[data-hqevn]");
  if (evn) {
    const [aid, sid] = evn.dataset.hqevn.split("|");
    const note = prompt("ملاحظتك للطالبة:");
    if (note === null) return;
    return run(async () => {
      const r = await sb.from("evaluations").upsert(
        { assignment_id: aid, student_id: sid, score: 3, note: note, teacher_id: ME.id },
        { onConflict: "assignment_id,student_id", ignoreDuplicates: false });
      if (r.error) throw r.error;
    }, "اتحفظت الملاحظة ✓");
  }

  /* ---- المالكة ---- */
  if (hit("#hqToggle")) return run(async () => {
    const r = await sb.from("circles").update({ active: !CIRCLE.active }).eq("id", CIRCLE.id);
    if (r.error) throw r.error;
  }, "اتغيّرت حالة الخدمة ✓");
  if (hit("#hqEndsSave")) return run(async () => {
    const r = await sb.from("circles").update({ ends_on: val("hqEnds") || null }).eq("id", CIRCLE.id);
    if (r.error) throw r.error;
  }, "اتحفظ التاريخ ✓");
  const mem = hit("[data-hqmem]");
  if (mem) {
    const [sid, add] = mem.dataset.hqmem.split("|");
    return run(async () => {
      const r = add === "1"
        ? await sb.from("circle_members").insert({ circle_id: CIRCLE.id, student_id: sid })
        : await sb.from("circle_members").delete().eq("circle_id", CIRCLE.id).eq("student_id", sid);
      if (r.error) throw r.error;
    }, "اتظبطت العضوية ✓");
  }
});

V && V.addEventListener("change", async e => {
  const rl = e.target.closest("[data-hqrole]");
  if (rl) return run(async () => {
    const r = await sb.from("profiles").update({ role: rl.value }).eq("id", rl.dataset.hqrole);
    if (r.error) throw r.error;
  }, "اتغيّر الدور ✓");
});

/* ------------------------------- نفتح الواجب بأدوات الموقع اللي موجودة --- */
function openInMemo(a) {
  const br = B();
  if (!br) { toast("ما قدرتش أفتح السورة.", true); return; }
  br.S.surah = a.surah; br.S.juz = 0; br.save();
  const btn = document.querySelector('.tabs [data-tab="memo"]');
  if (btn) btn.click();
  setTimeout(() => {
    let first = null;
    document.querySelectorAll('#v-memo .aitem[data-k]').forEach(el => {
      const p = el.dataset.k.split(":");
      const inR = +p[0] === a.surah && +p[1] >= a.from_ayah && +p[1] <= a.to_ayah;
      if (inR) { el.dataset.hl = "1"; if (!first) first = el; }
      else delete el.dataset.hl;
    });
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    toast(SU(a.surah) + " — من آية " + ar(a.from_ayah) + " لآية " + ar(a.to_ayah));
  }, 350);
}

/* ------------------------------------------ الطالبة تنزّل بياناتها هي --- */
async function exportMine() {
  try {
    const list = await myAssignments();
    const out = {
      الحساب: { الاسم: ME.full_name, الإيميل: ME.email },
      الحلقة: CIRCLE ? CIRCLE.name : null,
      تاريخ_التصدير: new Date().toISOString(),
      الواجبات: list.map(a => ({
        السورة: SU(a.surah), من_آية: a.from_ayah, لآية: a.to_ayah,
        النوع: KIND[a.kind] || a.kind, الموعد: a.due_on, ملاحظة: a.note,
        أنهيت_التدريب: !!(a.submissions || []).find(s => s.student_id === ME.id),
        تقييم_المعلمة: (() => {
          const e = (a.evaluations || []).find(s => s.student_id === ME.id);
          return e ? { الدرجة: e.score, ملاحظة: e.note } : null;
        })()
      }))
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = "بياناتي-في-الحلقة.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    toast("نزّلنا الملف ✓");
  } catch (e) { toast(why(e), true); }
}

/* ============================================================== البداية = */
if (CFG.url && CFG.anonKey) {
  sb = createClient(CFG.url, CFG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  sb.auth.onAuthStateChange((evt) => {
    if (evt === "PASSWORD_RECOVERY") RECOVER = true;
    paint();
  });
}
window.renderHalaqa = () => { paint(); };
paint();

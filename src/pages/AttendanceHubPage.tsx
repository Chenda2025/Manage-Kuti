import { ArrowLeft, ClipboardList, FileBarChart2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { uiForAttendanceType } from '../lib/attendanceTypeUi'
import { useAttendanceTypes } from '../lib/useAttendanceTypes'

export function AttendanceHubPage() {
  const navigate = useNavigate()
  const types = useAttendanceTypes()

  return (
    <div className="rise space-y-4">
      <section className="rounded-[22px] border border-line bg-paper px-4 py-3.5 shadow-[inset_3px_0_0_0_var(--color-saffron)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-maroon"
            aria-label="ត្រឡប់"
          >
            <ArrowLeft size={17} />
          </button>
          <h1 className="min-w-0 flex-1 font-title text-[18px] leading-[1.7] text-maroon">វត្តមានកុដិ</h1>
        </div>
      </section>

      {types.loading ? (
        <Spinner />
      ) : types.data.length === 0 ? (
        <p className="rounded-[22px] border border-line bg-paper p-4 text-sm text-muted">
          មិនទាន់មានប្រភេទវត្តមាន — បន្ថែមនៅការកំណត់
        </p>
      ) : (
        <div className="grid gap-3">
          {types.data.map((item) => {
            const ui = uiForAttendanceType(item.key, item.label)
            return (
              <article key={item.key} className="rounded-[24px] border border-line bg-paper p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff1d6] text-saffron">
                    <ClipboardList size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-ink">{item.label}</h2>
                    <p className="mt-0.5 text-xs text-muted">{ui.hubBlurb}</p>
                  </div>
                </div>
                <div
                  className={`mt-3 grid gap-2 ${ui.showReportLink ? 'grid-cols-2' : 'grid-cols-1'}`}
                >
                  <Link
                    to={`/attendance/${item.key}`}
                    className="rounded-2xl bg-saffron px-3 py-2.5 text-center text-sm font-bold text-white"
                  >
                    កត់ត្រា
                  </Link>
                  {ui.showReportLink ? (
                    <Link
                      to={`/attendance/${item.key}/reports`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-cream px-3 py-2.5 text-sm font-bold text-maroon"
                    >
                      <FileBarChart2 size={15} />
                      របាយការណ៍
                    </Link>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

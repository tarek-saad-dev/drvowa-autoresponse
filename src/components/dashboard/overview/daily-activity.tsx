export function DailyActivitySummary({
  activity,
}: {
  activity: {
    conversationsToday: number;
    interventionsToday: number | null;
  } | null;
}) {
  if (!activity) {
    return (
      <section
        aria-label="نشاط اليوم"
        className="rounded-2xl border border-border bg-card px-4 py-3"
      >
        <p className="text-xs font-bold text-muted-foreground">نشاط اليوم</p>
        <p className="mt-1 text-sm font-bold text-foreground/80">
          ملخص النشاط غير متاح حاليًا
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="نشاط اليوم"
      className="rounded-2xl border border-border bg-card px-4 py-3"
    >
      <p className="text-xs font-bold text-muted-foreground">نشاط اليوم</p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <p>
          <span className="font-black tabular-nums">
            {activity.conversationsToday}
          </span>
          <span className="ms-1.5 text-muted-foreground">محادثة تمت متابعتها</span>
        </p>
        <p>
          {activity.interventionsToday == null ? (
            <span className="text-muted-foreground">التدخل البشري غير متاح</span>
          ) : (
            <>
              <span className="font-black tabular-nums">
                {activity.interventionsToday}
              </span>
              <span className="ms-1.5 text-muted-foreground">محتاجة تدخل بشري</span>
            </>
          )}
        </p>
      </div>
    </section>
  );
}

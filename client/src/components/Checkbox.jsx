import styled from 'styled-components';

const Checkbox = ({ checked, onChange, id, className, children }) => {
  return (
    <StyledWrapper className={className}>
      <label className={children ? 'row' : 'container'} htmlFor={id}>
        <span className="box">
          <input
            type="checkbox"
            id={id}
            checked={!!checked}
            onChange={e => onChange?.(e.target.checked)}
          />
          <div className="checkmark" />
        </span>
        {children && <span className="row-text">{children}</span>}
      </label>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  display: inline-flex;
  width: 100%;

  .container, .row {
    cursor: pointer;
    user-select: none;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    width: 100%;
  }

  .row-text {
    min-width: 0;
    padding-top: 0.1em;
  }

  /* checkbox box */
  .box {
    display: block;
    position: relative;
    font-size: 15px;
    width: 1.4em;
    height: 1.4em;
    flex-shrink: 0;
  }

  .box input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
  }

  .box .checkmark {
    position: absolute;
    top: 0;
    left: 0;
    height: 1.4em;
    width: 1.4em;
    background-color: var(--surface-input, rgba(148, 163, 184, 0.08));
    border: 2px solid var(--border-strong, rgba(148, 163, 184, 0.5));
    border-radius: 8% 92% 12% 88% / 87% 11% 89% 13%;
    box-shadow: 2.5px 2.5px 0px var(--border-strong, rgba(148, 163, 184, 0.5));
    transition:
      transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275),
      box-shadow 0.2s, background-color 0.2s, border-color 0.2s;
  }

  .container:hover .checkmark, .row:hover .checkmark {
    transform: scale(1.05) rotate(2deg);
  }

  .box input:checked ~ .checkmark {
    background-color: #ff4f00;
    border-color: #ff4f00;
    border-radius: 92% 8% 88% 12% / 11% 87% 13% 89%;
    box-shadow: 2.5px 2.5px 0px rgba(255, 79, 0, 0.35);
    transform: scale(1.1) rotate(-2deg);
  }

  .box input:focus-visible ~ .checkmark {
    outline: 2px solid #06b6d4;
    outline-offset: 2px;
  }

  .box .checkmark:after {
    content: "";
    position: absolute;
    display: none;
    left: 0.36em;
    top: 0.09em;
    width: 0.3em;
    transform: translate(-50%, -50%) rotate(40deg);
    height: 0.7em;
    border: solid #fff;
    border-width: 0 0.2em 0.2em 0;
    border-radius: 2px;
  }

  /* checked */
  .box input:checked ~ .checkmark:after {
    display: block;
    animation: splash 0.3s forwards;
  }

  .container:active .checkmark, .row:active .checkmark {
    transform: scale(0.9) translateY(2px);
    box-shadow: 0px 0px 0px transparent;
  }

  @keyframes splash {
    0% {
      transform: scale(0) rotate(40deg);
      opacity: 0;
    }
    70% {
      transform: scale(1.2) rotate(40deg);
    }
    100% {
      transform: scale(1) rotate(40deg);
      opacity: 1;
    }
  }`;

export default Checkbox;

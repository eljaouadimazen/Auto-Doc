import styled from 'styled-components';

const Input = ({
  id, type = 'text', value, onChange, placeholder, disabled, className, rightSlot,
}) => {
  return (
    <StyledWrapper className={className}>
      <div className="inp-border">
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className="input"
        />
        {rightSlot && <div className="right-slot">{rightSlot}</div>}
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  width: 100%;

  .inp-border {
    display: flex;
    align-items: center;
    padding: 1.5px;
    border-radius: 10px;
    width: 100%;
    background: var(--border-default, rgba(148, 163, 184, 0.3));
    transition: background 0.3s ease;
  }

  .input {
    text-align: left;
    padding: 0.55rem 0.85rem;
    outline: none;
    border: none;
    background: var(--surface-input, rgba(30, 41, 59, 0.6));
    color: var(--text-primary, #e2e8f0);
    border-radius: 9px;
    box-sizing: border-box;
    display: block;
    width: 100%;
    min-width: 0;
    font-size: 0.8125rem;
    font-family: inherit;
  }

  .input::placeholder {
    color: var(--text-muted, #64748b);
    opacity: 0.7;
  }

  .input:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .right-slot {
    display: flex;
    align-items: center;
    padding-right: 0.4rem;
    flex-shrink: 0;
  }

  .inp-border:focus-within,
  .inp-border:hover {
    background: linear-gradient(
      100deg,
      #ff4f00 0%,
      #ff8a3d 45%,
      #06b6d4 100%
    );
  }`;

export default Input;
